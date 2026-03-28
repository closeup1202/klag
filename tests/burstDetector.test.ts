import { describe, it, expect } from 'vitest'
import { detectProducerBurst } from '../src/analyzer/burstDetector.js'
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

describe('detectProducerBurst', () => {
  it('returns empty array if partitions is empty', () => {
    const snapshot = makeSnapshot(100)
    const rateSnapshot: RateSnapshot = { intervalMs: 5000, partitions: [] }
    expect(detectProducerBurst(snapshot, rateSnapshot)).toEqual([])
  })

  it('returns empty array if produce rate is below MIN_PRODUCE_RATE (idle)', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(0.5, 0)
    expect(detectProducerBurst(snapshot, rate)).toEqual([])
  })

  it('returns empty array if produce/consume ratio is below 2x', () => {
    // 10 / 6 = 1.6x < 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 6)
    expect(detectProducerBurst(snapshot, rate)).toEqual([])
  })

  it('returns empty array if consume rate is near zero — SLOW_CONSUMER handles that case', () => {
    // consume < 0.1 is stalled consumer territory, not producer burst
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(20, 0)
    expect(detectProducerBurst(snapshot, rate)).toEqual([])
  })

  it('returns PRODUCER_BURST if produce rate is at least 2x consume rate', () => {
    // 10 / 3 = 3.3x >= 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 3)
    const results = detectProducerBurst(snapshot, rate)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('PRODUCER_BURST')
    expect(results[0].topic).toBe('orders')
  })

  it('does not return PRODUCER_BURST if lag is 0', () => {
    const snapshot = makeSnapshot(0)
    const rate = makeRateSnapshot(10, 3)
    expect(detectProducerBurst(snapshot, rate)).toEqual([])
  })

  it('description contains produce/consume rate values', () => {
    const snapshot = makeSnapshot(500)
    const rate = makeRateSnapshot(30, 5)
    const results = detectProducerBurst(snapshot, rate)

    expect(results[0].description).toContain('30.0 msg/s')
    expect(results[0].description).toContain('5.0 msg/s')
  })

  it('detects burst for all matching topics, not just the first', () => {
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
        { topic: 'orders',   partition: 0, produceRate: 20, consumeRate: 2 },
        { topic: 'payments', partition: 0, produceRate: 30, consumeRate: 3 },
      ],
    }
    const results = detectProducerBurst(snapshot, rateSnapshot)

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.topic)).toContain('orders')
    expect(results.map((r) => r.topic)).toContain('payments')
  })
})
