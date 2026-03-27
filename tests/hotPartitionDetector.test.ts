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
  it('totalLag이 0이면 빈 배열 반환', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('파티션이 1개면 빈 배열 반환', () => {
    const snapshot = makeSnapshot([100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('lag이 균등하게 분산되면 빈 배열 반환', () => {
    const snapshot = makeSnapshot([100, 100, 100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('단일 파티션에 80% 이상 집중되면 HOT_PARTITION 반환', () => {
    const snapshot = makeSnapshot([800, 100, 100])
    const results = detectHotPartition(snapshot)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('HOT_PARTITION')
    expect(results[0].details[0].partition).toBe(0)
    expect(results[0].details[0].ratio).toBeCloseTo(0.8)
  })

  it('79% 집중이면 빈 배열 반환 (threshold 경계값)', () => {
    const snapshot = makeSnapshot([790, 110, 100])
    expect(detectHotPartition(snapshot)).toEqual([])
  })

  it('HOT_PARTITION 결과에 topic, description, suggestion이 포함된다', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const results = detectHotPartition(snapshot)

    expect(results[0].topic).toBe('orders')
    expect(results[0].description).toContain('partition-0')
    expect(results[0].suggestion).toBeTruthy()
  })

  it('topic이 여러 개면 topic별로 독립적으로 분석한다', () => {
    // orders topic: partition-0에 90% 집중 → HOT_PARTITION
    // payments topic: 균등 분산 → 감지 안 됨
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