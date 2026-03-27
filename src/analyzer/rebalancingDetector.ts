import type { LagSnapshot, RcaResult } from '../types/index.js'

const REBALANCING_STATES = ['PreparingRebalance', 'CompletingRebalance']

export function detectRebalancing(snapshot: LagSnapshot): RcaResult | null {
  const { groupState, totalLag } = snapshot

  if (!REBALANCING_STATES.includes(groupState)) return null
  if (totalLag === 0n) return null

  const isPrearing = groupState === 'PreparingRebalance'

  return {
    type: 'REBALANCING',
    topic: '*',
    description:
      `consumer group is currently in ${groupState} state` +
      ` — all consumption is paused during rebalancing`,
    suggestion: isPrearing
      ? 'A new consumer joined or left the group. Lag may spike temporarily — monitor if it recovers after rebalancing completes'
      : 'Rebalancing is completing. Lag should recover shortly once partition assignment is finalized',
    details: [],
  }
}
/*

판정 로직:

group.state === 'PreparingRebalance'
→ consumer 추가/제거로 rebalance 시작
→ 이 시간 동안 모든 consumption 중단 → lag 급증

group.state === 'CompletingRebalance'
→ partition 재할당 완료 직전
→ 곧 정상화될 것 
*/