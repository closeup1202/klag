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
  it('partitions가 비어있으면 null 반환', () => {
    const snapshot = makeSnapshot(100)
    const rate: RateSnapshot = { intervalMs: 5000, partitions: [] }
    expect(detectSlowConsumer(snapshot, rate)).toBeNull()
  })

  it('produce rate가 MIN 미만이면 null 반환 (idle)', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(0.5, 0)
    expect(detectSlowConsumer(snapshot, rate)).toBeNull()
  })

  it('consume rate가 정상이면 null 반환', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(5, 0.5)  // consume >= STALLED_THRESHOLD
    expect(detectSlowConsumer(snapshot, rate)).toBeNull()
  })

  it('produce 활발 + consume 거의 0 → SLOW_CONSUMER 반환', () => {
    const snapshot = makeSnapshot(100)
    const rate = makeRateSnapshot(5, 0.05)
    const result = detectSlowConsumer(snapshot, rate)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('SLOW_CONSUMER')
    expect(result?.topic).toBe('orders')
  })

  it('lag이 0이면 null 반환', () => {
    const snapshot = makeSnapshot(0)
    const rate = makeRateSnapshot(5, 0)
    expect(detectSlowConsumer(snapshot, rate)).toBeNull()
  })

  it('description에 produce rate 수치가 포함된다', () => {
    const snapshot = makeSnapshot(500)
    const rate = makeRateSnapshot(8, 0)
    const result = detectSlowConsumer(snapshot, rate)

    expect(result?.description).toContain('8.0 msg/s')
  })
})