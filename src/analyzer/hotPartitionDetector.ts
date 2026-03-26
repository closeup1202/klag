import type { LagSnapshot, RcaResult, HotPartitionDetail } from '../types/index.js'

// 전체 lag 중 단일 파티션이 이 비율 이상을 차지하면 HOT_PARTITION으로 판정
const HOT_PARTITION_THRESHOLD = 0.8

export function detectHotPartition(snapshot: LagSnapshot): RcaResult | null {
  const { partitions, totalLag } = snapshot

  // totalLag이 0이면 분석 불필요
  if (totalLag === 0n) return null

  // 파티션이 1개면 비교 대상이 없으므로 분석 불필요
  if (partitions.length <= 1) return null

  // ── 파티션별 lag 비율 계산 ─────────────────────────────────────
  const details: HotPartitionDetail[] = partitions
    .filter((p) => p.lag > 0n)
    .map((p) => ({
      partition: p.partition,
      lag: p.lag,
      ratio: Number(p.lag) / Number(totalLag),
    }))
    .sort((a, b) => b.ratio - a.ratio) // 비율 높은 순 정렬

  const top = details[0]

  // ── HOT_PARTITION 판정 ────────────────────────────────────────
  if (!top || top.ratio < HOT_PARTITION_THRESHOLD) return null

  // topic 이름 찾기 (lag이 가장 높은 파티션의 topic)
  const hotPartition = partitions.find((p) => p.partition === top.partition)
  const topic = hotPartition?.topic ?? 'unknown'

  const ratioPercent = Math.round(top.ratio * 100)
  const totalPartitionCount = partitions.length

  return {
    type: 'HOT_PARTITION',
    topic,
    description:
      `partition-${top.partition} 에 lag의 ${ratioPercent}% 집중 ` +
      `(${top.lag.toLocaleString()} / ${totalLag.toLocaleString()}) ` +
      `— ${totalPartitionCount}개 파티션 중 1개에 쏠림`,
    suggestion:
      '파티션 키 분산 전략 검토 또는 파티션 수 증가를 고려해보세요',
    details,
  }
}

/* 
핵심 로직 설명
totalLag = 1,234

partition-0 lag = 1,204  →  ratio = 1204/1234 = 0.975 (97.5%)
partition-1 lag =    12  →  ratio =   12/1234 = 0.009
partition-2 lag =    18  →  ratio =   18/1234 = 0.014

top.ratio (0.975) >= threshold (0.8)  →  HOT_PARTITION 판정 ✅ 
*/