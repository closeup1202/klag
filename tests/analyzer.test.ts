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
  it('totalLag이 0이면 빈 배열 반환', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(analyze(snapshot)).toEqual([])
  })

  it('rateSnapshot 없으면 HOT_PARTITION만 분석', () => {
    // partition-0에 90% 집중
    const snapshot = makeSnapshot([900, 50, 50])
    const results = analyze(snapshot)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('HOT_PARTITION')
  })

  it('rateSnapshot 있으면 PRODUCER_BURST + HOT_PARTITION 둘 다 분석', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const rate = makeRateSnapshot(30, 2)
    const results = analyze(snapshot, rate)

    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('PRODUCER_BURST')
    expect(results[1].type).toBe('HOT_PARTITION')
  })

  it('lag 균등 분산 + rate 정상이면 빈 배열 반환', () => {
    const snapshot = makeSnapshot([100, 100, 100])
    const rate = makeRateSnapshot(10, 8)  // 1.25x < 2.0x threshold
    const results = analyze(snapshot, rate)

    expect(results).toEqual([])
  })

  it('PRODUCER_BURST만 감지되는 경우', () => {
    // lag은 균등하지만 produce rate가 consume rate의 3배
    const snapshot = makeSnapshot([100, 100, 100])
    const rate = makeRateSnapshot(30, 5)
    const results = analyze(snapshot, rate)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('PRODUCER_BURST')
  })
})