// ─── Kafka 연결 옵션 ───────────────────────────────────────────────
export interface KafkaOptions {
  broker: string
  groupId: string
  intervalMs?: number  // 샘플링 간격 (기본 5000ms)
  timeoutMs?: number
}

// ─── 파티션별 Lag 정보 ────────────────────────────────────────────
export interface PartitionLag {
  topic: string
  partition: number
  logEndOffset: bigint   // broker의 최신 offset
  committedOffset: bigint // consumer가 커밋한 offset
  lag: bigint
  lagRatio?: number // 전체 lag 중 이 파티션이 차지하는 비율 (0~1)
}

// ─── Consumer Group 전체 Lag 수집 결과 ───────────────────────────
export interface LagSnapshot {
  groupId: string
  broker: string
  collectedAt: Date
  partitions: PartitionLag[]
  totalLag: bigint
}

// ─── 파티션별 Rate 정보 ───────────────────────────────────────────
export interface PartitionRate {
  topic: string
  partition: number
  produceRate: number   // msg/s — broker에 쌓이는 속도
  consumeRate: number   // msg/s — consumer가 처리하는 속도
}

// ─── Rate 샘플링 결과 ─────────────────────────────────────────────
export interface RateSnapshot {
  intervalMs: number          // 실제 샘플링 간격
  partitions: PartitionRate[]
}

// ─── Lag 수준 등급 ────────────────────────────────────────────────
export type LagLevel = 'OK' | 'WARN' | 'HIGH'

export function classifyLag(lag: bigint): LagLevel {
  if (lag < 100n) return 'OK'
  if (lag < 1000n) return 'WARN'
  return 'HIGH'
}

// ─── RCA 분석 결과 ────────────────────────────────────────────────
export type RcaType = 'HOT_PARTITION' | 'PRODUCER_BURST' | 'NONE'

export interface RcaResult {
  type: RcaType
  topic: string
  description: string
  suggestion: string
  details: HotPartitionDetail[]
}

export interface HotPartitionDetail {
  partition: number
  lag: bigint
  ratio: number
}