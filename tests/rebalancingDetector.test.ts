import { describe, it, expect } from 'vitest'
import { detectRebalancing } from '../src/analyzer/rebalancingDetector.js'
import type { LagSnapshot } from '../src/types/index.js'

function makeSnapshot(groupState: string, totalLag: number): LagSnapshot {
  return {
    groupId: 'test-group',
    broker: 'localhost:9092',
    collectedAt: new Date(),
    groupState,
    partitions: [
      {
        topic: 'orders',
        partition: 0,
        logEndOffset: BigInt(10000 + totalLag),
        committedOffset: 10000n,
        lag: BigInt(totalLag),
      },
    ],
    totalLag: BigInt(totalLag),
  }
}

describe('detectRebalancing', () => {
  it('Stable 상태면 null 반환', () => {
    const snapshot = makeSnapshot('Stable', 100)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('Empty 상태면 null 반환', () => {
    const snapshot = makeSnapshot('Empty', 100)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('totalLag이 0이면 null 반환', () => {
    const snapshot = makeSnapshot('PreparingRebalance', 0)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('PreparingRebalance 상태면 REBALANCING 반환', () => {
    const snapshot = makeSnapshot('PreparingRebalance', 100)
    const result = detectRebalancing(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('REBALANCING')
  })

  it('CompletingRebalance 상태면 REBALANCING 반환', () => {
    const snapshot = makeSnapshot('CompletingRebalance', 100)
    const result = detectRebalancing(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('REBALANCING')
  })

  it('PreparingRebalance와 CompletingRebalance는 다른 suggestion을 가진다', () => {
    const preparing = detectRebalancing(makeSnapshot('PreparingRebalance', 100))
    const completing = detectRebalancing(makeSnapshot('CompletingRebalance', 100))

    expect(preparing?.suggestion).not.toBe(completing?.suggestion)
  })
})