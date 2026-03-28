import { describe, it, expect } from 'vitest'
import { detectSlowConsumer } from '../src/analyzer/slowConsumerDetector.js'
import type { LagSnapshot, RateSnapshot } from '../src/types/index.js'

function makeSnapshot(topicLag: number): LagSnapshot {
  return {
    groupId: 'test-group',
    broker: 'localhost:9092',
    collectedAt: new Date(),
    groupState: 'Stable',
    partitions: [
      {
        topic: 'orders',
        partition: 0,
        logEndOffset: BigInt(10000 + topicLag),
        committedOffset: 10000n,
        lag: BigInt(topicLag),
      },
    ],
    totalLag: BigInt(topicLag),
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

describe('detectSlowConsumer', () => {
  it('returns empty array if partitions is empty', () => {
    const snapshot = makeSnapshot(100)
    const rate: RateSnapshot = { intervalMs: 5000, partitions: [] }
    expect(detectSlowConsumer(snapshot, rate)).toEqual([])
  })

  it('returns empty array if produce rate is below MIN_PRODUCE_RATE (idle)', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(0.5, 0)
    expect(detectSlowConsumer(snapshot, rate)).toEqual([])
  })

  it('returns empty array if consume rate is above stalled threshold', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(5, 0.5)  // consume >= STALLED_THRESHOLD
    expect(detectSlowConsumer(snapshot, rate)).toEqual([])
  })

  it('returns SLOW_CONSUMER when produce is active and consume is near zero', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(5, 0.05)
    const results = detectSlowConsumer(snapshot, rate)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('SLOW_CONSUMER')
    expect(results[0].topic).toBe('orders')
  })

  it('returns empty array if lag is 0', () => {
    const snapshot = makeSnapshot(0)
    const rate = makeRateSnapshot(5, 0)
    expect(detectSlowConsumer(snapshot, rate)).toEqual([])
  })

  it('description contains the produce rate value', () => {
    const snapshot = makeSnapshot(500)
    const rate = makeRateSnapshot(8, 0)
    const results = detectSlowConsumer(snapshot, rate)

    expect(results[0].description).toContain('8.0 msg/s')
  })

  it('detects stalled consumers for all matching topics, not just the first', () => {
    const snapshot: LagSnapshot = {
      groupId: 'test-group',
      broker: 'localhost:9092',
      collectedAt: new Date(),
      groupState: 'Stable',
      partitions: [
        { topic: 'orders',   partition: 0, logEndOffset: 10100n, committedOffset: 10000n, lag: 100n },
        { topic: 'payments', partition: 0, logEndOffset: 10200n, committedOffset: 10000n, lag: 200n },
      ],
      totalLag: 300n,
    }
    const rateSnapshot: RateSnapshot = {
      intervalMs: 5000,
      partitions: [
        { topic: 'orders',   partition: 0, produceRate: 5, consumeRate: 0 },
        { topic: 'payments', partition: 0, produceRate: 8, consumeRate: 0 },
      ],
    }
    const results = detectSlowConsumer(snapshot, rateSnapshot)

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.topic)).toContain('orders')
    expect(results.map((r) => r.topic)).toContain('payments')
  })
})
