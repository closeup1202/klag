import { describe, it, expect } from 'vitest'
import { detectProducerBurst } from '../src/analyzer/burstDetector.js'
import type { LagSnapshot, RateSnapshot } from '../src/types/index.js'

function makeSnapshot(topicLag: number): LagSnapshot {
  return {
    groupId: 'test-group',
    broker: 'localhost:9092',
    collectedAt: new Date(),
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
  it('returns null if partitions is empty', () => {
    const snapshot = makeSnapshot(100)
    const rateSnapshot: RateSnapshot = { intervalMs: 5000, partitions: [] }
    expect(detectProducerBurst(snapshot, rateSnapshot)).toBeNull()
  })

  it('returns null if produce rate is below MIN_PRODUCE_RATE (idle)', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(0.5, 0)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('returns null if produce/consume ratio is below 2x', () => {
    // 10 / 6 = 1.6x < 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 6)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('returns PRODUCER_BURST if produce rate is at least 2x consume rate', () => {
    // 10 / 3 = 3.3x >= 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 3)
    const result = detectProducerBurst(snapshot, rate)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('PRODUCER_BURST')
    expect(result?.topic).toBe('orders')
  })

  it('returns PRODUCER_BURST if consume rate is 0 and produce rate is sufficient', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(20, 0)
    const result = detectProducerBurst(snapshot, rate)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('PRODUCER_BURST')
  })

  it('does not return PRODUCER_BURST if lag is 0', () => {
    // no burst detection needed when there is no lag
    const snapshot = makeSnapshot(0)
    const rate = makeRateSnapshot(20, 0)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('description contains produce/consume rate values', () => {
    const snapshot = makeSnapshot(500)
    const rate = makeRateSnapshot(30, 5)
    const result = detectProducerBurst(snapshot, rate)

    expect(result?.description).toContain('30.0 msg/s')
    expect(result?.description).toContain('5.0 msg/s')
  })
})
