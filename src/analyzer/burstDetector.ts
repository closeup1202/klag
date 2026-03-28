import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";

// Classify as PRODUCER_BURST if produce rate is this multiple of consume rate or higher
const BURST_RATIO_THRESHOLD = 2.0;

// Only classify when produce rate is at or above this value (ignore very low traffic)
const MIN_PRODUCE_RATE = 1.0;

// When consume rate is below this, the consumer is considered stalled — SLOW_CONSUMER territory
const STALLED_CONSUME_RATE = 0.1;

export function detectProducerBurst(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot,
): RcaResult[] {
  const { partitions: ratePartitions } = rateSnapshot;

  if (ratePartitions.length === 0) return [];

  // ── Aggregate produce/consume rate per topic ──────────────────
  const topicRateMap = new Map<
    string,
    { totalProduce: number; totalConsume: number }
  >();

  for (const p of ratePartitions) {
    let entry = topicRateMap.get(p.topic);
    if (!entry) {
      entry = { totalProduce: 0, totalConsume: 0 };
      topicRateMap.set(p.topic, entry);
    }
    entry.totalProduce += p.produceRate;
    entry.totalConsume += p.consumeRate;
  }

  // ── Detect BURST per topic ────────────────────────────────────
  const results: RcaResult[] = [];

  for (const [topic, rates] of topicRateMap) {
    const { totalProduce, totalConsume } = rates;

    // Ignore if produce rate is too low (idle)
    if (totalProduce < MIN_PRODUCE_RATE) continue;

    // If consume is near zero the consumer has stalled — leave that to SLOW_CONSUMER
    if (totalConsume < STALLED_CONSUME_RATE) continue;

    if (totalProduce / totalConsume < BURST_RATIO_THRESHOLD) continue;

    // Calculate totalLag for the topic
    const topicLag = snapshot.partitions
      .filter((p) => p.topic === topic)
      .reduce((sum, p) => sum + p.lag, 0n);

    if (topicLag === 0n) continue;

    results.push({
      type: "PRODUCER_BURST",
      topic,
      description:
        `produce rate ${totalProduce.toFixed(1)} msg/s vs consume rate ${totalConsume.toFixed(1)} msg/s ` +
        `(${(totalProduce / totalConsume).toFixed(1)}x difference) — consumer is falling behind ingestion rate`,
      suggestion: "Consider increasing consumer instances or partition count",
    });
  }

  return results;
}
/*
Decision logic summary:

produceRate  10 msg/s, consumeRate  3 msg/s
ratio = 10 / 3 = 3.3x  >=  threshold 2.0x  →  PRODUCER_BURST ✅

produceRate  10 msg/s, consumeRate  6 msg/s
ratio = 10 / 6 = 1.6x  <   threshold 2.0x  →  normal (temporary difference)

produceRate   0.5 msg/s  <  MIN_PRODUCE_RATE 1.0  →  idle, ignored

produceRate   5 msg/s, consumeRate  0.05 msg/s  <  STALLED_CONSUME_RATE  →  SLOW_CONSUMER handles this
*/
