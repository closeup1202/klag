declare const __APP_VERSION__: string;
export const VERSION = __APP_VERSION__;

// ─── SSL/SASL auth types ──────────────────────────────────────────────────
export type SaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512";

export interface SslOptions {
  enabled: boolean;
  caPath?: string;
  certPath?: string;
  keyPath?: string;
}

export interface SaslOptions {
  mechanism: SaslMechanism;
  username: string;
  password?: string; // resolved at runtime from CLI arg or KLAG_SASL_PASSWORD env var
}

// ─── Kafka connection options ─────────────────────────────────────────────
export interface KafkaOptions {
  broker: string;
  groupId: string;
  intervalMs?: number; // Sampling interval (default 5000ms)
  timeoutMs?: number;
  ssl?: SslOptions;
  sasl?: SaslOptions;
}

// ─── .klagrc file schema ──────────────────────────────────────────────────
export interface RcFileSchema {
  broker?: string;
  group?: string;
  interval?: number;
  timeout?: number;
  ssl?: Partial<SslOptions>;
  sasl?: Partial<SaslOptions>;
}

// ─── Per-partition lag info ───────────────────────────────────────────────
export interface PartitionLag {
  topic: string;
  partition: number;
  logEndOffset: bigint; // Latest offset on the broker
  committedOffset: bigint; // Offset committed by the consumer
  lag: bigint;
  lagRatio?: number; // This partition's share of total lag (0~1)
  lagDiff?: bigint;
}

// ─── Consumer group total lag collection result ───────────────────────────
export interface LagSnapshot {
  groupId: string;
  broker: string;
  collectedAt: Date;
  partitions: PartitionLag[];
  totalLag: bigint;
  groupState: string;
}

// ─── Per-partition rate info ──────────────────────────────────────────────
export interface PartitionRate {
  topic: string;
  partition: number;
  produceRate: number; // msg/s — rate at which messages accumulate on the broker
  consumeRate: number; // msg/s — rate at which the consumer processes messages
}

// ─── Rate sampling result ─────────────────────────────────────────────────
export interface RateSnapshot {
  intervalMs: number; // Actual sampling interval
  partitions: PartitionRate[];
}

// ─── Lag severity level ───────────────────────────────────────────────────
export type LagLevel = "OK" | "WARN" | "HIGH";

/**
 * Classify lag severity.
 *
 * When consumeRate is provided, uses time-to-drain (seconds):
 *   - consumeRate = 0  → HIGH (consumer stuck)
 *   - drainSec < 60    → OK
 *   - drainSec < 300   → WARN
 *   - drainSec ≥ 300   → HIGH
 *
 * When consumeRate is undefined (no rate data), falls back to absolute thresholds:
 *   - lag < 10,000     → OK
 *   - lag < 100,000    → WARN
 *   - lag ≥ 100,000    → HIGH
 */
export function classifyLag(lag: bigint, consumeRate?: number): LagLevel {
  if (lag === 0n) return "OK";

  if (consumeRate !== undefined) {
    if (consumeRate === 0) return "HIGH";
    const drainSec = Number(lag) / consumeRate;
    if (drainSec < 60) return "OK";
    if (drainSec < 300) return "WARN";
    return "HIGH";
  }

  // Fallback: absolute thresholds when rate info is unavailable
  if (lag < 10_000n) return "OK";
  if (lag < 100_000n) return "WARN";
  return "HIGH";
}

/**
 * Format estimated time to drain the lag at the given consume rate.
 * Returns "—" for zero lag, "∞" for a stuck consumer.
 */
export function formatDrainTime(lag: bigint, consumeRate: number): string {
  if (lag === 0n) return "—";
  if (consumeRate === 0) return "∞";
  const sec = Math.ceil(Number(lag) / consumeRate);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (sec < 3600) return s > 0 ? `${m}m${s}s` : `${m}m`;
  return `>${Math.floor(sec / 3600)}h`;
}

// ─── RCA analysis result ──────────────────────────────────────────────────
export type RcaType =
  | "HOT_PARTITION"
  | "PRODUCER_BURST"
  | "SLOW_CONSUMER"
  | "REBALANCING"
  | "NONE";

export interface RcaResult {
  type: RcaType;
  topic: string;
  description: string;
  suggestion: string;
  details?: HotPartitionDetail[];
}

export interface HotPartitionDetail {
  partition: number;
  lag: bigint;
  ratio: number;
}
