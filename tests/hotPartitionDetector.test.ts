import { describe, it, expect } from 'vitest'
import { detectHotPartition } from '../src/analyzer/hotPartitionDetector.js'
import type { LagSnapshot } from '../src/types/index.js'

// 테스트용 snapshot 생성 헬퍼
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
  it('totalLag이 0이면 null 반환', () => {
    const snapshot = makeSnapshot([0, 0, 0])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('파티션이 1개면 null 반환', () => {
    const snapshot = makeSnapshot([100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('lag이 균등하게 분산되면 null 반환', () => {
    // 각 파티션이 33%씩 → threshold 80% 미달
    const snapshot = makeSnapshot([100, 100, 100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('단일 파티션에 80% 이상 집중되면 HOT_PARTITION 반환', () => {
    // partition-0: 800 / 1000 = 80%
    const snapshot = makeSnapshot([800, 100, 100])
    const result = detectHotPartition(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('HOT_PARTITION')
    expect(result?.details[0].partition).toBe(0)
    expect(result?.details[0].ratio).toBeCloseTo(0.8)
  })

  it('79% 집중이면 null 반환 (threshold 경계값)', () => {
    // partition-0: 790 / 1000 = 79%
    const snapshot = makeSnapshot([790, 110, 100])
    expect(detectHotPartition(snapshot)).toBeNull()
  })

  it('HOT_PARTITION 결과에 topic, description, suggestion이 포함된다', () => {
    const snapshot = makeSnapshot([900, 50, 50])
    const result = detectHotPartition(snapshot)

    expect(result?.topic).toBe('orders')
    expect(result?.description).toContain('partition-0')
    expect(result?.suggestion).toBeTruthy()
  })
})