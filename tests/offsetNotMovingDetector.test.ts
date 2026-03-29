import { describe, expect, it } from "vitest";
import { detectOffsetNotMoving } from "../src/analyzer/offsetNotMovingDetector.js";
import type { LagSnapshot, RateSnapshot } from "../src/types/index.js";

function makeSnapshot(
  topicLag: number,
  groupState = "Stable",
): LagSnapshot {
  return {
    groupId: "test-group",
    broker: "localhost:9092",
    collectedAt: new Date(),
    groupState,
    partitions: [
      {
        topic: "orders",
        partition: 0,
        logEndOffset: BigInt(10000 + topicLag),
        committedOffset: 10000n,
        lag: BigInt(topicLag),
      },
    ],
    totalLag: BigInt(topicLag),
  };
}

function makeRateSnapshot(
  produceRate: number,
  consumeRate: number,
): RateSnapshot {
  return {
    intervalMs: 5000,
    partitions: [{ topic: "orders", partition: 0, produceRate, consumeRate }],
  };
}

describe("detectOffsetNotMoving", () => {
  it("returns empty array when rateSnapshot has no partitions", () => {
    const snapshot = makeSnapshot(100);
    const rate: RateSnapshot = { intervalMs: 5000, partitions: [] };
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("detects OFFSET_NOT_MOVING when offset is frozen and producer is idle", () => {
    const snapshot = makeSnapshot(100);
    const rate = makeRateSnapshot(0, 0);
    const results = detectOffsetNotMoving(snapshot, rate);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("OFFSET_NOT_MOVING");
    expect(results[0].topic).toBe("orders");
  });

  it("returns empty array when lag is zero", () => {
    const snapshot = makeSnapshot(0);
    const rate = makeRateSnapshot(0, 0);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("returns empty array when lag is below MIN_STUCK_LAG (< 5)", () => {
    const snapshot = makeSnapshot(4);
    const rate = makeRateSnapshot(0, 0);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("detects when lag equals MIN_STUCK_LAG exactly (= 5)", () => {
    const snapshot = makeSnapshot(5);
    const rate = makeRateSnapshot(0, 0);
    const results = detectOffsetNotMoving(snapshot, rate);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("OFFSET_NOT_MOVING");
  });

  it("returns empty array when consume rate is moving (>= 0.1)", () => {
    const snapshot = makeSnapshot(100);
    const rate = makeRateSnapshot(0, 0.1);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("defers to SLOW_CONSUMER when produce rate >= 1.0 (not emitted here)", () => {
    const snapshot = makeSnapshot(100);
    const rate = makeRateSnapshot(1.0, 0);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("returns empty array when group is rebalancing (PreparingRebalance)", () => {
    const snapshot = makeSnapshot(100, "PreparingRebalance");
    const rate = makeRateSnapshot(0, 0);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("returns empty array when group is rebalancing (CompletingRebalance)", () => {
    const snapshot = makeSnapshot(100, "CompletingRebalance");
    const rate = makeRateSnapshot(0, 0);
    expect(detectOffsetNotMoving(snapshot, rate)).toEqual([]);
  });

  it("description includes partition number and lag", () => {
    const snapshot = makeSnapshot(200);
    const rate = makeRateSnapshot(0, 0);
    const results = detectOffsetNotMoving(snapshot, rate);

    expect(results[0].description).toContain("0");
    expect(results[0].description).toContain("200");
  });

  it("detects across multiple topics independently", () => {
    const snapshot: LagSnapshot = {
      groupId: "test-group",
      broker: "localhost:9092",
      collectedAt: new Date(),
      groupState: "Stable",
      partitions: [
        {
          topic: "orders",
          partition: 0,
          logEndOffset: 10100n,
          committedOffset: 10000n,
          lag: 100n,
        },
        {
          topic: "payments",
          partition: 0,
          logEndOffset: 10200n,
          committedOffset: 10000n,
          lag: 200n,
        },
      ],
      totalLag: 300n,
    };
    const rate: RateSnapshot = {
      intervalMs: 5000,
      partitions: [
        { topic: "orders", partition: 0, produceRate: 0, consumeRate: 0 },
        { topic: "payments", partition: 0, produceRate: 0, consumeRate: 0 },
      ],
    };
    const results = detectOffsetNotMoving(snapshot, rate);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.topic)).toContain("orders");
    expect(results.map((r) => r.topic)).toContain("payments");
  });

  it("only flags stuck partitions, not partitions where offset is moving", () => {
    const snapshot: LagSnapshot = {
      groupId: "test-group",
      broker: "localhost:9092",
      collectedAt: new Date(),
      groupState: "Stable",
      partitions: [
        {
          topic: "orders",
          partition: 0,
          logEndOffset: 10100n,
          committedOffset: 10000n,
          lag: 100n,
        },
        {
          topic: "orders",
          partition: 1,
          logEndOffset: 10050n,
          committedOffset: 10000n,
          lag: 50n,
        },
      ],
      totalLag: 150n,
    };
    const rate: RateSnapshot = {
      intervalMs: 5000,
      partitions: [
        { topic: "orders", partition: 0, produceRate: 0, consumeRate: 0 }, // stuck
        { topic: "orders", partition: 1, produceRate: 0, consumeRate: 0.5 }, // moving
      ],
    };
    const results = detectOffsetNotMoving(snapshot, rate);

    expect(results).toHaveLength(1);
    expect(results[0].description).toContain("[0]");
    expect(results[0].description).not.toContain("[1]");
  });
});
