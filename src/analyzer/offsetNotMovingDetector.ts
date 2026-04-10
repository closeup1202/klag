import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";

// Minimum lag for a partition to be considered stuck (avoids noise from tiny backlogs)
const MIN_STUCK_LAG = 5n;

// Treat consume rate below this as "offset not moving"
const STALLED_CONSUME_RATE = 0.1;

// When produce rate is at or above this, SLOW_CONSUMER handles it instead
const MIN_PRODUCE_RATE = 1.0;

export function detectOffsetNotMoving(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot,
): RcaResult[] {
  const { partitions: ratePartitions } = rateSnapshot;

  if (ratePartitions.length === 0) return [];

  // OFFSET_NOT_MOVING only applies to a Stable group.
  // A rebalancing group is handled by detectRebalancing.
  if (snapshot.groupState !== "Stable") return [];

  // ── Build per-topic rate aggregation ─────────────────────────
  const topicRateMap = new Map<
    string,
    { totalProduce: number; totalConsume: number; stuckPartitions: number[] }
  >();

  for (const p of ratePartitions) {
    let entry = topicRateMap.get(p.topic);
    if (!entry) {
      entry = { totalProduce: 0, totalConsume: 0, stuckPartitions: [] };
      topicRateMap.set(p.topic, entry);
    }
    entry.totalProduce += p.produceRate;
    entry.totalConsume += p.consumeRate;
  }

  // ── Mark partitions whose offset has not moved ───────────────
  for (const p of ratePartitions) {
    const entry = topicRateMap.get(p.topic);
    if (!entry) continue;

    // Only flag partitions that have meaningful lag and a frozen offset
    const lagPartition = snapshot.partitions.find(
      (sp) => sp.topic === p.topic && sp.partition === p.partition,
    );
    if (!lagPartition) continue;
    if (lagPartition.lag < MIN_STUCK_LAG) continue;
    if (p.consumeRate >= STALLED_CONSUME_RATE) continue;

    entry.stuckPartitions.push(p.partition);
  }

  // ── Emit one result per affected topic ───────────────────────
  const results: RcaResult[] = [];

  for (const [topic, rates] of topicRateMap) {
    if (rates.stuckPartitions.length === 0) continue;

    // Check produce rate only for the stuck partitions themselves.
    // Using topic-level totalProduce would suppress this detector whenever a healthy
    // partition in the same topic has active production, hiding truly stuck partitions.
    const stuckProduceRate = rates.stuckPartitions.reduce(
      (sum, partitionId) => {
        const rp = ratePartitions.find(
          (r) => r.topic === topic && r.partition === partitionId,
        );
        return sum + (rp?.produceRate ?? 0);
      },
      0,
    );

    // If the stuck partitions themselves have active produce, SLOW_CONSUMER handles them
    if (stuckProduceRate >= MIN_PRODUCE_RATE) continue;

    const topicLag = snapshot.partitions
      .filter((p) => p.topic === topic)
      .reduce((sum, p) => sum + p.lag, 0n);

    if (topicLag === 0n) continue;

    const partitionList = rates.stuckPartitions
      .sort((a, b) => a - b)
      .join(", ");
    const partitionWord =
      rates.stuckPartitions.length === 1 ? "partition" : "partitions";

    results.push({
      type: "OFFSET_NOT_MOVING",
      topic,
      description:
        `committed offset has not moved on ${partitionWord} [${partitionList}] ` +
        `while lag remains ${topicLag.toLocaleString()} — consumer group is Stable but making no progress`,
      suggestion:
        "Check if auto-commit is disabled and manual commits are being skipped, " +
        "look for processing exceptions that prevent commit, or verify the consumer is not stuck in a retry loop",
    });
  }

  return results;
}
/*
Decision logic summary:

groupState !== "Stable"                        →  skip (REBALANCING handles it)
consumeRate >= 0.1 (per partition)             →  offset is moving, no issue
lag < MIN_STUCK_LAG (5) (per partition)        →  too small to matter
stuckPartitionProduceRate >= 1.0               →  SLOW_CONSUMER handles those partitions
all conditions met                             →  OFFSET_NOT_MOVING ✅

Mutual exclusivity is checked at partition level (not topic level) to avoid
missing stuck partitions that share a topic with healthy partitions:
  SLOW_CONSUMER:       stuckPartition.produceRate >= 1.0 AND consumeRate < 0.1
  OFFSET_NOT_MOVING:   stuckPartition.produceRate <  1.0 AND consumeRate < 0.1
*/
