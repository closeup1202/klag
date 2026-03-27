import type { LagSnapshot, RcaResult } from "../types/index.js";

const REBALANCING_STATES = ["PreparingRebalance", "CompletingRebalance"];

export function detectRebalancing(snapshot: LagSnapshot): RcaResult | null {
  const { groupState, totalLag } = snapshot;

  if (!REBALANCING_STATES.includes(groupState)) return null;
  if (totalLag === 0n) return null;

  const isPreparing = groupState === "PreparingRebalance";

  return {
    type: "REBALANCING",
    topic: "*",
    description:
      `consumer group is currently in ${groupState} state` +
      ` — all consumption is paused during rebalancing`,
    suggestion: isPreparing
      ? "A new consumer joined or left the group. Lag may spike temporarily — monitor if it recovers after rebalancing completes"
      : "Rebalancing is completing. Lag should recover shortly once partition assignment is finalized",
  };
}
/*
Detection logic:

group.state === 'PreparingRebalance'
→ A consumer joined or left, triggering a rebalance
→ All consumption is paused during this window → lag spikes

group.state === 'CompletingRebalance'
→ Partition reassignment is nearly done
→ Should recover shortly
*/
