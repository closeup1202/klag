// ─── Kafka connection options ─────────────────────────────────────────────
export interface KafkaOptions {
  broker: string
  groupId: string
  intervalMs?: number  // Sampling interval (default 5000ms)
  timeoutMs?: number
}

// ─── Per-partition lag info ───────────────────────────────────────────────
export interface PartitionLag {
  topic: string
  partition: number
  logEndOffset: bigint   // Latest offset on the broker
  committedOffset: bigint // Offset committed by the consumer
  lag: bigint
  lagRatio?: number // This partition's share of total lag (0~1)
  lagDiff?: bigint
}

// ─── Consumer group total lag collection result ───────────────────────────
export interface LagSnapshot {
  groupId: string
  broker: string
  collectedAt: Date
  partitions: PartitionLag[]
  totalLag: bigint
  groupState: string
}

// ─── Per-partition rate info ──────────────────────────────────────────────
export interface PartitionRate {
  topic: string
  partition: number
  produceRate: number   // msg/s — rate at which messages accumulate on the broker
  consumeRate: number   // msg/s — rate at which the consumer processes messages
}

// ─── Rate sampling result ─────────────────────────────────────────────────
export interface RateSnapshot {
  intervalMs: number          // Actual sampling interval
  partitions: PartitionRate[]
}

// ─── Lag severity level ───────────────────────────────────────────────────
export type LagLevel = 'OK' | 'WARN' | 'HIGH'

export function classifyLag(lag: bigint): LagLevel {
  if (lag < 100n) return 'OK'
  if (lag < 1000n) return 'WARN'
  return 'HIGH'
}

// ─── RCA analysis result ──────────────────────────────────────────────────
export type RcaType = 'HOT_PARTITION' | 'PRODUCER_BURST' | 'SLOW_CONSUMER' | 'REBALANCING' | 'NONE'

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
