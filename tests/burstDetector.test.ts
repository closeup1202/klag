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
  it('partitions가 비어있으면 null 반환', () => {
    const snapshot = makeSnapshot(100)
    const rateSnapshot: RateSnapshot = { intervalMs: 5000, partitions: [] }
    expect(detectProducerBurst(snapshot, rateSnapshot)).toBeNull()
  })

  it('produce rate가 MIN_PRODUCE_RATE 미만이면 null 반환 (idle)', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(0.5, 0)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('produce/consume 비율이 2배 미만이면 null 반환', () => {
    // 10 / 6 = 1.6x < 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 6)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('produce rate가 consume rate의 2배 이상이면 PRODUCER_BURST 반환', () => {
    // 10 / 3 = 3.3x >= 2.0x
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(10, 3)
    const result = detectProducerBurst(snapshot, rate)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('PRODUCER_BURST')
    expect(result?.topic).toBe('orders')
  })

  it('consume rate가 0이고 produce rate가 충분하면 PRODUCER_BURST 반환', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(20, 0)
    const result = detectProducerBurst(snapshot, rate)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('PRODUCER_BURST')
  })

  it('lag이 0이면 PRODUCER_BURST 반환 안 함', () => {
    // lag이 없으면 burst 판정 불필요
    const snapshot = makeSnapshot(0)
    const rate = makeRateSnapshot(20, 0)
    expect(detectProducerBurst(snapshot, rate)).toBeNull()
  })

  it('description에 produce/consume rate 수치가 포함된다', () => {
    const snapshot = makeSnapshot(500)
    const rate = makeRateSnapshot(30, 5)
    const result = detectProducerBurst(snapshot, rate)

    expect(result?.description).toContain('30.0 msg/s')
    expect(result?.description).toContain('5.0 msg/s')
  })
})