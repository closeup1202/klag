import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";

const MIN_PRODUCE_RATE = 1.0;
const STALLED_CONSUME_RATE = 0.1; // Treat as effectively stalled

export function detectSlowConsumer(
  snapshot: LagSnapshot,
  rateSnapshot: RateSnapshot,
): RcaResult[] {
  const { partitions: ratePartitions } = rateSnapshot;

  if (ratePartitions.length === 0) return [];

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

  const results: RcaResult[] = [];

  for (const [topic, rates] of topicRateMap) {
    const { totalProduce, totalConsume } = rates;

    // Active produce but consume near zero → stalled consumer
    if (totalProduce < MIN_PRODUCE_RATE) continue;
    if (totalConsume >= STALLED_CONSUME_RATE) continue;

    const topicLag = snapshot.partitions
      .filter((p) => p.topic === topic)
      .reduce((sum, p) => sum + p.lag, 0n);

    if (topicLag === 0n) continue;

    results.push({
      type: "SLOW_CONSUMER",
      topic,
      description:
        `consumer has stalled — produce rate ${totalProduce.toFixed(1)} msg/s but consume rate is near 0` +
        ` — messages are accumulating with no consumption`,
      suggestion:
        "Check if consumer process is alive, look for errors in consumer logs, or check for long GC pauses",
    });
  }

  return results;
}
