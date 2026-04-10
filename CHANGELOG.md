# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-04-10

### Fixed
- `OFFSET_NOT_MOVING` was not detected when a stuck partition shared a topic with healthy partitions
  - The produce rate check used the topic-level aggregate (`totalProduce`), so a healthy partition's produce activity could suppress detection of a truly stuck partition in the same topic
  - Now checks produce rate only for the stuck partitions themselves — a stuck partition with no produce activity fires `OFFSET_NOT_MOVING` regardless of what other partitions in the topic are doing

## [0.5.0] - 2026-04-03

### Changed
- `--no-rate` mode no longer shows a **Status** column or group-level status judgment
  - Previously, when rate sampling was skipped, severity was classified using absolute lag thresholds (OK < 10,000 / WARN < 100,000 / HIGH ≥ 100,000), which caused all partitions to appear `🟢 OK` and the group to show `✅ OK` regardless of actual lag
  - Without consume rate data it is impossible to determine whether lag is draining or stuck, so any threshold-based verdict is misleading
  - The partition table now omits the Status column entirely in `--no-rate` mode
  - The Group Status summary line now shows `—` instead of a false OK/WARNING/CRITICAL label

## [0.4.1] - 2026-03-30

### Added
- `OFFSET_NOT_MOVING` detector — identifies consumer groups that are Stable but have made no commit progress while lag remains non-zero
  - Triggers when: `consumeRate < 0.1 msg/s` AND `produceRate < 1.0 msg/s` AND `lag ≥ 5` AND `groupState === "Stable"`
  - Mutually exclusive with `SLOW_CONSUMER` (which handles the active-producer case) and `REBALANCING`
  - Reports the specific stuck partition numbers and total lag per topic
  - Suggestion covers: auto-commit disabled with manual commits skipped, processing loop stuck, crash-loop between processing and commit

## [0.3.1] - 2026-03-29

### Added
- Interactive consumer group picker — omit `--group` to select from a live list fetched from the broker
- Groups are sorted by state (Stable first, Dead last) and filterable by typing (autocomplete)

## [0.3.0] - 2026-03-28

### Changed
- Lag severity classification now uses **time-to-drain** when rate data is available:
  - `OK` — current lag drainable in under 60 seconds at current consume rate
  - `WARN` — 60s – 5 minutes
  - `HIGH` — over 5 minutes, or consume rate is zero (consumer stuck)
- Absolute fallback thresholds updated to more realistic values when rate data is unavailable:
  - `OK` < 10,000 / `WARN` < 100,000 / `HIGH` ≥ 100,000 (was 100 / 1,000)

### Added
- **Drain** column in the partition table — shows estimated time to clear lag (e.g. `42s`, `2m30s`, `>1h`, `∞`)
- Drain time displayed in the Group Status summary line alongside Total Lag

## [0.2.0] - 2026-03-28

### Added
- SSL/TLS support: `--ssl`, `--ssl-ca`, `--ssl-cert`, `--ssl-key` flags
- SASL authentication: `--sasl-mechanism` (`plain`, `scram-sha-256`, `scram-sha-512`),
  `--sasl-username`, `--sasl-password`
- `KLAG_SASL_PASSWORD` environment variable as a secure alternative to `--sasl-password`
- `.klagrc` config file support — store default options in the current directory or `~/.klagrc`;
  CLI arguments always take precedence
- Friendly error message for SASL authentication failures
- GitHub Actions workflow for automated npm publish on version tag push

## [0.1.0] - 2026-03-28

### Added
- Kafka consumer lag collection via KafkaJS AdminClient
- Per-partition lag table with colored severity levels (OK / WARN / HIGH)
- Root cause analysis (RCA) engine with four detectors:
  - `HOT_PARTITION` — detects skewed lag concentration across partitions
  - `PRODUCER_BURST` — detects produce rate outpacing consume rate (2x threshold)
  - `SLOW_CONSUMER` — detects stalled consumer with near-zero consume rate
  - `REBALANCING` — detects lag spike during group rebalancing
- Rate sampling via two-snapshot delta (produce rate / consume rate in msg/s)
- Watch mode (`--watch`) with auto-refresh, countdown timer, and lag trend indicators (▲/▼/=)
- `--no-rate` flag to skip rate sampling for faster output
- `--json` flag for machine-readable output
- `--timeout` option for connection timeout configuration
- Friendly error messages for connection failures and missing consumer groups
- Watch mode retry logic (up to 3 retries before exiting)

### Fixed
- `SLOW_CONSUMER` was unreachable: `PRODUCER_BURST` would always fire first when
  consume rate was near zero. The two detectors now use mutually exclusive thresholds —
  `PRODUCER_BURST` requires consume ≥ 0.1 msg/s; below that is `SLOW_CONSUMER` territory
- `detectProducerBurst` and `detectSlowConsumer` only reported the first affected topic;
  both now return results for all matching topics
- `AssignerProtocol.MemberAssignment.decode` (internal KafkaJS API) is now wrapped in
  try-catch so a future API change degrades gracefully via the `fetchOffsets` fallback
- `--broker` port validation now rejects values outside the valid range (1–65535)
