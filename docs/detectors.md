# klag Detector Reference

klag collects two snapshots of Kafka broker/consumer state and runs five detectors against them to identify the root cause of consumer lag growth.

---

## How data is collected

### Lag snapshot (`collectLag`)

1. `describeGroups` — fetches group state and partition assignment per member
2. `fetchOffsets` — fetches the last committed offset per partition
3. `fetchTopicOffsets` — fetches the log-end offset (latest broker offset) per partition
4. `lag = logEndOffset − committedOffset`

### Rate snapshot (`collectRate`)

Two lag snapshots are taken `N` seconds apart (default 5s):

```
t = 0s  → snapshot1: logEndOffset1, committedOffset1
t = Ns  → snapshot2: logEndOffset2, committedOffset2

produceRate = (logEndOffset2  − logEndOffset1)  / N   (msg/s)
consumeRate = (committedOffset2 − committedOffset1) / N   (msg/s)
```

- **produceRate** — rate at which messages accumulate on the broker
- **consumeRate** — rate at which the consumer advances its committed offset

---

## Detectors

### `HOT_PARTITION`

**Concept**

Lag is concentrated on a single partition while others are healthy. This typically means the producer is hashing most messages to the same key, causing one partition to receive disproportionate traffic.

**Detection logic**

```
For each topic with totalLag ≥ 10 and partition count > 1:
  ratio = partition.lag / totalTopicLag
  if ratio ≥ 0.80 → HOT_PARTITION
```

Requires rate data: **No** (lag snapshot only)

---

### `PRODUCER_BURST`

**Concept**

The producer is writing messages faster than the consumer can process them, and the consumer is still running (consumeRate > 0). The gap between produce rate and consume rate is causing lag to grow.

**Detection logic**

```
For each topic:
  if totalProduce ≥ 2 × totalConsume
  AND totalConsume ≥ 0.1 msg/s     ← consumer is running
  AND topicLag > 0
  → PRODUCER_BURST
```

Requires rate data: **Yes**

---

### `SLOW_CONSUMER`

**Concept**

The producer is actively writing but the consumer has stalled — consume rate has dropped to near zero. Likely causes: consumer process crash, long GC pause, or a processing error blocking the consume loop.

**Detection logic**

```
For each topic:
  if totalProduce ≥ 1.0 msg/s      ← active producer
  AND totalConsume < 0.1 msg/s     ← consumer stalled
  AND topicLag > 0
  → SLOW_CONSUMER
```

Requires rate data: **Yes**

---

### `REBALANCING`

**Concept**

The consumer group is currently reassigning partitions between members. All consumption pauses during a rebalance, which causes a temporary lag spike. Triggered by a consumer joining, leaving, or crashing.

**Detection logic**

```
if groupState === "PreparingRebalance" OR "CompletingRebalance"
AND totalLag > 0
→ REBALANCING
```

Requires rate data: **No** (lag snapshot only)

---

### `OFFSET_NOT_MOVING`

**Concept**

The consumer group is `Stable` (members are connected and partitions are assigned), but the committed offset on specific partitions has not advanced between the two samples while lag remains non-zero. The consumer is alive but making no progress — typically caused by auto-commit being disabled with manual commits skipped, a processing exception blocking the commit path, or a crash-loop between message processing and offset commit.

**Detection logic**

```
if groupState !== "Stable" → skip

For each partition in rateSnapshot:
  if partition.lag ≥ 5
  AND consumeRate < 0.1 msg/s
  → mark as stuck

For each topic with stuck partitions:
  stuckProduceRate = sum of produceRate for stuck partitions only
  if stuckProduceRate ≥ 1.0 msg/s → skip (SLOW_CONSUMER handles it)
  if topicLag > 0
  → OFFSET_NOT_MOVING (lists the stuck partition numbers)
```

Requires rate data: **Yes**

> **Note:** The produce rate check is intentionally scoped to the **stuck partitions themselves**, not the topic total. This prevents a healthy partition's produce activity from suppressing detection of a truly stuck partition sharing the same topic.

---

## Mutual exclusivity

| Condition | Detector |
|-----------|----------|
| `groupState` is `PreparingRebalance` / `CompletingRebalance` | `REBALANCING` |
| `produceRate ≥ 2× consumeRate` AND `consumeRate ≥ 0.1` | `PRODUCER_BURST` |
| `produceRate ≥ 1.0` AND `consumeRate < 0.1` | `SLOW_CONSUMER` |
| `produceRate < 1.0` AND `consumeRate < 0.1` AND `groupState === Stable` | `OFFSET_NOT_MOVING` |
| Single partition holds ≥ 80% of topic lag | `HOT_PARTITION` |

`PRODUCER_BURST` and `SLOW_CONSUMER` are mutually exclusive via the `consumeRate` threshold.  
`SLOW_CONSUMER` and `OFFSET_NOT_MOVING` are mutually exclusive via the `produceRate` threshold.  
`HOT_PARTITION` can fire alongside any rate-based detector.

---

## Decision flow

```
collectLag  ─────────────────────────────────────────┐
                                                      ▼
                                             detectRebalancing
                                             detectHotPartition

collectRate ─────────────────────────────────────────┐
                                                      ▼
                                             detectProducerBurst
                                             detectSlowConsumer
                                             detectOffsetNotMoving
```

All results are aggregated and printed in the **Root Cause Analysis** section of the output.
