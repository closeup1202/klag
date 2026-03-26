import type { LagSnapshot, RcaResult, HotPartitionDetail } from '../types/index.js'

// Classify as HOT_PARTITION if a single partition holds at least this ratio of total lag
const HOT_PARTITION_THRESHOLD = 0.8

export function detectHotPartition(snapshot: LagSnapshot): RcaResult | null {
  const { partitions, totalLag } = snapshot

  // Skip analysis if totalLag is 0
  if (totalLag === 0n) return null

  // Skip analysis if only 1 partition (nothing to compare)
  if (partitions.length <= 1) return null

  // ── Calculate lag ratio per partition ────────────────────────
  const details: HotPartitionDetail[] = partitions
    .filter((p) => p.lag > 0n)
    .map((p) => ({
      partition: p.partition,
      lag: p.lag,
      ratio: Number(p.lag) / Number(totalLag),
    }))
    .sort((a, b) => b.ratio - a.ratio) // Sort by ratio descending

  const top = details[0]

  // ── HOT_PARTITION detection ───────────────────────────────────
  if (!top || top.ratio < HOT_PARTITION_THRESHOLD) return null

  // Find topic name (topic of partition with highest lag)
  const hotPartition = partitions.find((p) => p.partition === top.partition)
  const topic = hotPartition?.topic ?? 'unknown'

  const ratioPercent = Math.round(top.ratio * 100)
  const totalPartitionCount = partitions.length

  return {
    type: 'HOT_PARTITION',
    topic,
    description:
      `partition-${top.partition} holds ${ratioPercent}% of lag ` +
      `(${top.lag.toLocaleString()} / ${totalLag.toLocaleString()}) ` +
      `— skewed to 1 of ${totalPartitionCount} partitions`,
    suggestion:
      'Consider reviewing partition key distribution strategy or increasing partition count',
    details,
  }
}

/*
Core logic explanation:
totalLag = 1,234

partition-0 lag = 1,204  →  ratio = 1204/1234 = 0.975 (97.5%)
partition-1 lag =    12  →  ratio =   12/1234 = 0.009
partition-2 lag =    18  →  ratio =   18/1234 = 0.014

top.ratio (0.975) >= threshold (0.8)  →  HOT_PARTITION ✅
*/
