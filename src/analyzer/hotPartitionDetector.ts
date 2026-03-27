import type { LagSnapshot, RcaResult, HotPartitionDetail } from '../types/index.js'

const HOT_PARTITION_THRESHOLD = 0.8

export function detectHotPartition(snapshot: LagSnapshot): RcaResult[] {
  const { partitions } = snapshot

  if (partitions.length === 0) return []

  // ── topic별로 파티션 그룹화 ───────────────────────────────────
  const topicMap = new Map<string, typeof partitions>()
  for (const p of partitions) {
    if (!topicMap.has(p.topic)) topicMap.set(p.topic, [])
    topicMap.get(p.topic)!.push(p)
  }

  const results: RcaResult[] = []

  for (const [topic, topicPartitions] of topicMap) {
    // 파티션이 1개면 비교 대상 없음
    if (topicPartitions.length <= 1) continue

    const topicTotalLag = topicPartitions.reduce((sum, p) => sum + p.lag, 0n)

    // topic 자체 lag이 0이면 스킵
    if (topicTotalLag === 0n) continue

    // ── 파티션별 비율 계산 ──────────────────────────────────────
    const details: HotPartitionDetail[] = topicPartitions
      .filter((p) => p.lag > 0n)
      .map((p) => ({
        partition: p.partition,
        lag: p.lag,
        ratio: Number(p.lag) / Number(topicTotalLag),
      }))
      .sort((a, b) => b.ratio - a.ratio)

    const top = details[0]
    if (!top || top.ratio < HOT_PARTITION_THRESHOLD) continue

    const ratioPercent = Math.round(top.ratio * 100)
    const totalPartitionCount = topicPartitions.length

    results.push({
      type: 'HOT_PARTITION',
      topic,
      description:
        `partition-${top.partition} 에 lag의 ${ratioPercent}% 집중 ` +
        `(${top.lag.toLocaleString()} / ${topicTotalLag.toLocaleString()}) ` +
        `— ${totalPartitionCount}개 파티션 중 1개에 쏠림`,
      suggestion:
        'partition 키 분산 전략 검토 또는 파티션 수 증가를 고려해보세요',
      details,
    })
  }

  return results
}