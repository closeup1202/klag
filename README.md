# klag

> Know **why** your Kafka consumer lag is growing — in 5 seconds from the terminal

[![npm version](https://badge.fury.io/js/%40closeup1202%2Fkflag.svg)](https://www.npmjs.com/package/@closeup1202/klag)
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
npx @closeup1202/klag --broker localhost:9092 --group my-service
```

## Output example
```
⚡ klag 0.5.0

🔍 Consumer Group: my-service
   Broker:         localhost:9092
   Collected At:   2026-03-28 17:27:27 (Asia/Seoul)

   Group Status : 🚨 CRITICAL   Total Lag : 1,234   Drain : ∞

┌────────┬───────────┬──────────────────┬────────────────┬───────┬─────────┬──────┬──────────────┬──────────────┐
│ Topic  │ Partition │ Committed Offset │ Log-End Offset │  Lag  │ Status  │ Drain│ Produce Rate │ Consume Rate │
├────────┼───────────┼──────────────────┼────────────────┼───────┼─────────┼──────┼──────────────┼──────────────┤
│ orders │         0 │            8,796 │         10,000 │ 1,204 │ 🔴 HIGH │    ∞ │  40.0 msg/s  │   0.0 msg/s  │
│ orders │         1 │            9,988 │         10,000 │    12 │ 🟢 OK   │    — │   0.0 msg/s  │   0.0 msg/s  │
│ orders │         2 │            9,982 │         10,000 │    18 │ 🟢 OK   │    — │   0.0 msg/s  │   0.0 msg/s  │
└────────┴───────────┴──────────────────┴────────────────┴───────┴─────────┴──────┴──────────────┴──────────────┘

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
npm install -g @closeup1202/klag
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

# SSL (system CA trust)
klag --broker kafka.prod:9092 --group my-service --ssl

# SSL with custom certificates
klag --broker kafka.prod:9092 --group my-service \
  --ssl --ssl-ca /etc/kafka/ca.pem \
  --ssl-cert /etc/kafka/client.crt --ssl-key /etc/kafka/client.key

# SASL authentication (password via environment variable — recommended)
KLAG_SASL_PASSWORD=secret klag --broker kafka.prod:9092 --group my-service \
  --sasl-mechanism scram-sha-256 --sasl-username kafka-user

# SSL + SASL combined
KLAG_SASL_PASSWORD=secret klag --broker kafka.prod:9092 --group my-service \
  --ssl --sasl-mechanism scram-sha-256 --sasl-username kafka-user
```

## Config file (.klagrc)

Create `.klagrc` in the current directory or `~/.klagrc` to store default options.
CLI arguments always take precedence over the config file.

```json
{
  "broker": "kafka.prod.internal:9092",
  "group": "my-service",
  "interval": 3000,
  "ssl": {
    "enabled": true,
    "caPath": "/etc/kafka/ca.pem"
  },
  "sasl": {
    "mechanism": "scram-sha-256",
    "username": "kafka-user"
  }
}
```

With this file in place, you only need:
```bash
KLAG_SASL_PASSWORD=secret klag
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
| `--ssl` | Enable SSL/TLS | `false` |
| `--ssl-ca <path>` | CA certificate PEM file | - |
| `--ssl-cert <path>` | Client certificate PEM file | - |
| `--ssl-key <path>` | Client key PEM file | - |
| `--sasl-mechanism <type>` | `plain`, `scram-sha-256`, `scram-sha-512` | - |
| `--sasl-username <user>` | SASL username | - |
| `--sasl-password <pass>` | SASL password (prefer `KLAG_SASL_PASSWORD` env var) | - |

## Detectable root causes

#### `HOT_PARTITION`
When 80% or more of total lag is concentrated on a single partition.
Occurs when producer key distribution is uneven (key skew).

#### `PRODUCER_BURST`
When produce rate is at least 2x the consume rate (and the consumer is still running).
Occurs when traffic spikes and the consumer cannot keep up.

#### `SLOW_CONSUMER`
When the produce rate is active but the consume rate has dropped to near zero.
Occurs when the consumer process has stalled, crashed, or is blocked (e.g., long GC pause).

#### `REBALANCING`
When the consumer group is in `PreparingRebalance` or `CompletingRebalance` state.
All consumption pauses during rebalancing, which can cause a temporary lag spike.

#### `OFFSET_NOT_MOVING`
When the committed offset has not moved between samples while lag remains non-zero and the consumer group is Stable.
Indicates the consumer is alive but failing to commit — caused by auto-commit being disabled with manual commits skipped, a processing loop that is stuck, or a crash-loop between message processing and offset commit.

## Requirements

- Node.js >= 18
- Kafka >= 2.0

## Roadmap

- [x] v0.1.0 — lag collection, hot partition, producer burst, slow consumer, rebalancing detection, watch mode with lag trend
- [x] v0.2.0 — SSL/SASL authentication, `.klagrc` config file support
- [x] v0.3.0 — time-to-drain severity classification, Drain column per partition
- [x] v0.3.1 — interactive consumer group picker
- [x] v0.4.1 — `OFFSET_NOT_MOVING` detector (offset commit stall detection)
- [x] v0.5.0 — honest `--no-rate` mode: Status column removed when rate data is unavailable
- [ ] v0.6.0 — Slack alerts, Prometheus export

## License

MIT © [closeup1202](https://github.com/closeup1202/klag)
