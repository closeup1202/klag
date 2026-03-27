# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-27

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
