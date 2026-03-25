// ─── Kafka 연결 옵션 ───────────────────────────────────────────────
export interface KafkaOptions {
  broker: string
  groupId: string
}

// ─── 파티션별 Lag 정보 ────────────────────────────────────────────
export interface PartitionLag {
  topic: string
  partition: number
  logEndOffset: bigint   // broker의 최신 offset
  committedOffset: bigint // consumer가 커밋한 offset
  lag: bigint
}

// ─── Consumer Group 전체 Lag 수집 결과 ───────────────────────────
export interface LagSnapshot {
  groupId: string
  broker: string
  collectedAt: Date
  partitions: PartitionLag[]
  totalLag: bigint
}

// ─── Lag 수준 등급 ────────────────────────────────────────────────
export type LagLevel = 'OK' | 'WARN' | 'HIGH'

export function classifyLag(lag: bigint): LagLevel {
  if (lag < 100n) return 'OK'
  if (lag < 1000n) return 'WARN'
  return 'HIGH'
}