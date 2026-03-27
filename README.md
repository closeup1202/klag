# klag

> Know **why** your Kafka consumer lag is growing — in 5 seconds from the terminal

[![npm version](https://badge.fury.io/js/klag.svg)](https://www.npmjs.com/package/klag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Compared to existing tools

| | Burrow | Kafka UI | **klag** |
|--|--------|----------|---------------|
| Lag measurement | ✅ | ✅ | ✅ |
| Root cause detection | ❌ | ❌ | ✅ |
| CLI (npx) | ❌ | ❌ | ✅ |
| Requires separate server | ✅ | ✅ | ❌ |

## Run without installation
```bash
npx klag --broker localhost:9092 --group my-service
```

## Output example
```
⚡ klag  v0.1.0

🔍 Consumer Group: my-service
   Broker:         localhost:9092
   Collected At:   2026-03-26 17:27:27 (Asia/Seoul)

   Group Status : ⚠️  WARNING   Total Lag : 1,234

┌────────┬───────────┬──────────────────┬────────────────┬───────┬─────────┬──────────────┬──────────────┐
│ Topic  │ Partition │ Committed Offset │ Log-End Offset │  Lag  │ Status  │ Produce Rate │ Consume Rate │
├────────┼───────────┼──────────────────┼────────────────┼───────┼─────────┼──────────────┼──────────────┤
│ orders │         0 │            8,796 │         10,000 │ 1,204 │ 🔴 HIGH │  40.0 msg/s  │   0.0 msg/s  │
│ orders │         1 │            9,988 │         10,000 │    12 │ 🟢 OK   │   0.0 msg/s  │   0.0 msg/s  │
│ orders │         2 │            9,982 │         10,000 │    18 │ 🟢 OK   │   0.0 msg/s  │   0.0 msg/s  │
└────────┴───────────┴──────────────────┴────────────────┴───────┴─────────┴──────────────┴──────────────┘

🔎 Root Cause Analysis
   [PRODUCER_BURST] orders
   → produce rate 40.0 msg/s vs consume rate 0.0 msg/s (∞x difference)
   → Suggestion: consider increasing consumer instances or partition count

   [HOT_PARTITION] orders
   → partition-0 holds 98% of lag (1,204 / 1,234) — skewed to 1 of 3 partitions
   → Suggestion: review partition key distribution strategy or consider increasing partition count
```

## Installation
```bash
npm install -g klag
```

## Usage
```bash
# Basic usage
klag --broker localhost:9092 --group my-service

# Fast mode without rate sampling
klag --broker localhost:9092 --group my-service --no-rate

# Watch mode (auto-refresh every N seconds)
klag --broker localhost:9092 --group my-service --watch
klag --broker localhost:9092 --group my-service --watch --interval 3000

# JSON output (CI/pipeline integration)
klag --broker localhost:9092 --group my-service --json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-b, --broker <host:port>` | Kafka broker address | `localhost:9092` |
| `-g, --group <groupId>` | Consumer group ID | (required) |
| `-i, --interval <ms>` | Rate sampling interval | `5000` |
| `-t, --timeout <ms>` | Connection timeout | `5000` |
| `-w, --watch` | Watch mode | `false` |
| `--no-rate` | Skip rate sampling | `false` |
| `--json` | JSON output | `false` |

## Detectable root causes

### `[HOT_PARTITION]`
When 80% or more of total lag is concentrated on a single partition.
Occurs when producer key distribution is uneven (key skew).

### `[PRODUCER_BURST]`
When produce rate is at least 2x the consume rate.
Occurs when traffic spikes and the consumer cannot keep up.

## Requirements

- Node.js >= 18
- Kafka >= 2.0

## Roadmap

- [x] v0.1.0 — lag collection, hot partition, producer burst, watch mode
- [ ] v0.2.0 — multi-group monitoring, lag trend tracking (▲▼)
- [ ] v0.3.0 — Slack alerts, Prometheus export

## License

MIT © [closeup1202](https://github.com/closeup1202/klag)
