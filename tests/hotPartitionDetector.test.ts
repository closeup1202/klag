import { describe, it, expect } from 'vitest'
import { detectHotPartition } from '../src/analyzer/hotPartitionDetector.js'
import type { LagSnapshot } from '../src/types/index.js'

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
  it('returns empty array when totalLag is 0', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('returns empty array when there is only one partition', () => {
    const snapshot = makeSnapshot([100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('returns empty array when lag is evenly distributed', () => {
    const snapshot = makeSnapshot([100, 100, 100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('returns HOT_PARTITION when a single partition has 80% or more of the lag', () => {
    const snapshot = makeSnapshot([800, 100, 100])
    const results = detectHotPartition(snapshot)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('HOT_PARTITION')
    expect(results[0].details[0].partition).toBe(0)
    expect(results[0].details[0].ratio).toBeCloseTo(0.8)
  })

  it('returns empty array when concentration is 79% (threshold boundary)', () => {
    const snapshot = makeSnapshot([790, 110, 100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('HOT_PARTITION result includes topic, description, and suggestion', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const results = detectHotPartition(snapshot)

    expect(results[0].topic).toBe('orders')
    expect(results[0].description).toContain('partition-0')
    expect(results[0].suggestion).toBeTruthy()
  })

  it('analyzes each topic independently when there are multiple topics', () => {
    // orders topic: 90% concentrated in partition-0 → HOT_PARTITION
    // payments topic: evenly distributed → not detected
    const snapshot: LagSnapshot = {
      groupId: 'test-group',
      broker: 'localhost:9092',
      collectedAt: new Date(),
      partitions: [
        { topic: 'orders',   partition: 0, logEndOffset: 10900n, committedOffset: 10000n, lag: 900n },
        { topic: 'orders',   partition: 1, logEndOffset: 10050n, committedOffset: 10000n, lag: 50n  },
        { topic: 'orders',   partition: 2, logEndOffset: 10050n, committedOffset: 10000n, lag: 50n  },
        { topic: 'payments', partition: 0, logEndOffset: 10100n, committedOffset: 10000n, lag: 100n },
        { topic: 'payments', partition: 1, logEndOffset: 10100n, committedOffset: 10000n, lag: 100n },
      ],
      totalLag: 1200n,
    }

    const results = detectHotPartition(snapshot)

    expect(results).toHaveLength(1)
    expect(results[0].topic).toBe('orders')
  })
})