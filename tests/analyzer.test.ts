import { describe, it, expect } from 'vitest'
import { analyze } from '../src/analyzer/index.js'
import type { LagSnapshot, RateSnapshot } from '../src/types/index.js'

function makeSnapshot(lags: number[]): LagSnapshot {
  const partitions = lags.map((lag, i) => ({
    topic: 'orders',
    partition: i,
    logEndOffset: BigInt(10000 + lag),
    committedOffset: 10000n,
    lag: BigInt(lag),
  }))

  return {
    groupId: 'test-group',
    broker: 'localhost:9092',
    collectedAt: new Date(),
    groupState: 'Stable',
    partitions,
    totalLag: partitions.reduce((sum, p) => sum + p.lag, 0n),
  }
}

function makeRateSnapshot(produceRate: number, consumeRate: number): RateSnapshot {
  return {
    intervalMs: 5000,
    partitions: [
      { topic: 'orders', partition: 0, produceRate, consumeRate },
    ],
  }
}

describe('analyze', () => {
  it('returns empty array if totalLag is 0', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(analyze(snapshot)).toEqual([])
  })

  it('analyzes only HOT_PARTITION when no rateSnapshot', () => {
    // 90% concentrated on partition-0
    const snapshot = makeSnapshot([900, 50, 50])
    const results = analyze(snapshot)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('HOT_PARTITION')
  })

  it('analyzes both PRODUCER_BURST and HOT_PARTITION when rateSnapshot is provided', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const rate = makeRateSnapshot(30, 2)
    const results = analyze(snapshot, rate)

    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('PRODUCER_BURST')
    expect(results[1].type).toBe('HOT_PARTITION')
  })

  it('returns empty array if lag is evenly distributed and rate is normal', () => {
    const snapshot = makeSnapshot([100, 100, 100])
    const rate = makeRateSnapshot(10, 8)  // 1.25x < 2.0x threshold
    const results = analyze(snapshot, rate)

    expect(results).toEqual([])
  })

  it('detects only PRODUCER_BURST', () => {
    // lag is even but produce rate is 3x consume rate
    const snapshot = makeSnapshot([100, 100, 100])
    const rate = makeRateSnapshot(30, 5)
    const results = analyze(snapshot, rate)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('PRODUCER_BURST')
  })
})
