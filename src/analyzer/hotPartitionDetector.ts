import type {
  HotPartitionDetail,
  LagSnapshot,
  RcaResult,
} from "../types/index.js";

const HOT_PARTITION_THRESHOLD = 0.8;
const MIN_TOPIC_LAG = 10n;

export function detectHotPartition(snapshot: LagSnapshot): RcaResult[] {
  const { partitions } = snapshot;

  if (partitions.length === 0) return [];

  // ── Group partitions by topic ────────────────────────────────
  const topicMap = new Map<string, typeof partitions>();
  for (const p of partitions) {
    if (!topicMap.has(p.topic)) topicMap.set(p.topic, []);
    topicMap.get(p.topic)?.push(p);
  }

  const results: RcaResult[] = [];

  for (const [topic, topicPartitions] of topicMap) {
    // Skip if only one partition — nothing to compare against
    if (topicPartitions.length <= 1) continue;

    const topicTotalLag = topicPartitions.reduce((sum, p) => sum + p.lag, 0n);

    // Skip if the topic's total lag is 0 or less than MIN_TOPIC_LAG (10)
    if (topicTotalLag === 0n) continue;
    if (topicTotalLag < MIN_TOPIC_LAG) continue;

    // ── Calculate lag ratio per partition ───────────────────────
    const details: HotPartitionDetail[] = topicPartitions
      .filter((p) => p.lag > 0n)
      .map((p) => ({
        partition: p.partition,
        lag: p.lag,
        ratio: Number(p.lag) / Number(topicTotalLag),
      }))
      .sort((a, b) => b.ratio - a.ratio);

    const top = details[0];
    if (!top || top.ratio < HOT_PARTITION_THRESHOLD) continue;

    const ratioPercent = Math.round(top.ratio * 100);
    const totalPartitionCount = topicPartitions.length;

    results.push({
      type: "HOT_PARTITION",
      topic,
      description:
        `partition-${top.partition} holds ${ratioPercent}% of lag ` +
        `(${top.lag.toLocaleString()} / ${topicTotalLag.toLocaleString()}) ` +
        `— 1 of ${totalPartitionCount} partitions is skewed`,
      suggestion:
        "Consider reviewing the partition key distribution strategy or increasing the partition count",
      details,
    });
  }

  return results;
}
