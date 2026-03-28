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
  it('returns null when group state is Stable', () => {
    const snapshot = makeSnapshot('Stable', 100)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('returns null when group state is Empty', () => {
    const snapshot = makeSnapshot('Empty', 100)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('returns null when totalLag is 0', () => {
    const snapshot = makeSnapshot('PreparingRebalance', 0)
    expect(detectRebalancing(snapshot)).toBeNull()
  })

  it('returns REBALANCING when group state is PreparingRebalance', () => {
    const snapshot = makeSnapshot('PreparingRebalance', 100)
    const result = detectRebalancing(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('REBALANCING')
  })

  it('returns REBALANCING when group state is CompletingRebalance', () => {
    const snapshot = makeSnapshot('CompletingRebalance', 100)
    const result = detectRebalancing(snapshot)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('REBALANCING')
  })

  it('PreparingRebalance and CompletingRebalance produce different suggestions', () => {
    const preparing = detectRebalancing(makeSnapshot('PreparingRebalance', 100))
    const completing = detectRebalancing(makeSnapshot('CompletingRebalance', 100))

    expect(preparing?.suggestion).not.toBe(completing?.suggestion)
  })
})
