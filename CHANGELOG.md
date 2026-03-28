# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
