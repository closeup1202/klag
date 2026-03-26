import { describe, it, expect } from 'vitest'
import { detectHotPartition } from '../src/analyzer/hotPartitionDetector.js'
import type { LagSnapshot } from '../src/types/index.js'

// Helper to create test snapshot
function makeSnapshot(lags: number[]): LagSnapshot {
  const partitions = lags.map((lag, i) => ({
    topic: 'orders',
    partition: i,
    logEndOffset: BigInt(10000 + lag),
    committedOffset: BigInt(10000),
    lag: BigInt(lag),
  }))

  const totalLag = partitions.reduce((sum, p) => sum + p.lag, 0n)

  return {
    groupId: 'test-group',
    broker: 'localhost:9092',
    collectedAt: new Date(),
    partitions,
    totalLag,
  }
}

describe('detectHotPartition', () => {
  it('returns null if totalLag is 0', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('returns null if only 1 partition', () => {
    const snapshot = makeSnapshot([100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('returns null if lag is evenly distributed', () => {
    // each partition at 33% → below 80% threshold
    const snapshot = makeSnapshot([100, 100, 100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('returns HOT_PARTITION if 80% or more concentrated on a single partition', () => {
    // partition-0: 800 / 1000 = 80%
    const snapshot = makeSnapshot([800, 100, 100])
    const result = detectHotPartition(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('HOT_PARTITION')
    expect(result?.details[0].partition).toBe(0)
    expect(result?.details[0].ratio).toBeCloseTo(0.8)
  })

  it('returns null at 79% concentration (threshold boundary)', () => {
    // partition-0: 790 / 1000 = 79%
    const snapshot = makeSnapshot([790, 110, 100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('HOT_PARTITION result contains topic, description, and suggestion', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const result = detectHotPartition(snapshot)

    expect(result?.topic).toBe('orders')
    expect(result?.description).toContain('partition-0')
    expect(result?.suggestion).toBeTruthy()
  })
})
