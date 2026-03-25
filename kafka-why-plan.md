# kafka-why 프로젝트 계획

## 🎯 프로젝트 목표

> **"Kafka consumer lag이 왜 늘었는지, 터미널에서 5초 안에 알 수 있게"**

```bash
npx kafka-why --broker localhost:9092 --group my-service
```

```
⚡ kafka-why  v0.1.0

🔍 Analyzing consumer group: my-service
   Broker: localhost:9092

┌─────────────────────────────────────────────┐
│  GROUP STATUS: ⚠️  WARNING                   │
├──────────────┬────────┬──────────┬──────────┤
│ Topic        │  Part  │   Lag    │  Status  │
├──────────────┼────────┼──────────┼──────────┤
│ orders       │   0    │   1,204  │  🔴 HIGH  │
│ orders       │   1    │     12   │  🟢 OK    │
│ orders       │   2    │     18   │  🟢 OK    │
└──────────────┴────────┴──────────┴──────────┘

🔎 Root Cause Analysis
   [PRODUCER_BURST] orders / partition-0
   → produce rate  312 msg/s → 1,840 msg/s (+489%) at 14:32
   → consumer processing rate unchanged (avg 280 msg/s)

   [HOT_PARTITION] orders / partition-0
   → 94% of lag concentrated in 1/3 partitions
   → Likely cause: key skew (check partition key distribution)

💡 Suggestions
   • Consider increasing partition count for `orders`
   • Review producer key distribution strategy
```

---

## 🛠 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 언어 | TypeScript | 학습 목표 |
| Kafka 클라이언트 | `kafkajs` | Node.js 생태계 표준, 문서 훌륭 |
| CLI 프레임워크 | `commander` | 가볍고 직관적 |
| 터미널 UI | `chalk` + `cli-table3` | 색상/테이블 렌더링 |
| 패키지 배포 | npm (npx 실행) | 설치 없이 바로 사용 |
| 빌드 | `tsup` | zero-config TypeScript 번들러 |
| 테스트 | `vitest` | 빠름, TypeScript 네이티브 |
| 코드 품질 | `biome` | ESLint + Prettier 대체, 빠름 |

---

## 📦 아키텍처 구조

```
kafka-why/
├── src/
│   ├── cli/
│   │   └── index.ts          # commander 진입점
│   ├── collector/
│   │   ├── lagCollector.ts   # AdminClient로 offset 수집
│   │   └── rateCollector.ts  # 2번 샘플링 → produce/consume rate 계산
│   ├── analyzer/
│   │   ├── index.ts          # 분석 오케스트레이터
│   │   ├── burstDetector.ts  # Producer burst 감지
│   │   ├── slowDetector.ts   # Consumer slow 감지
│   │   ├── rebalanceDetector.ts
│   │   └── hotPartitionDetector.ts
│   ├── reporter/
│   │   ├── tableReporter.ts  # 터미널 테이블 출력
│   │   └── jsonReporter.ts   # --json 플래그용
│   └── types/
│       └── index.ts
├── tests/
├── package.json
└── tsconfig.json
```

### 핵심 데이터 흐름

```
kafkajs AdminClient
  → listOffsets (log-end offset)
  → fetchOffsets (committed offset)
  → describeGroups (member 상태)
    ↓
  lag = log-end - committed  (파티션별)
  rate = (offset₂ - offset₁) / Δt  (2번 샘플링)
    ↓
  Analyzer → 원인 분류
    ↓
  Reporter → 터미널 출력
```

---

## 📅 로드맵 (주 5시간 기준)

### Phase 1 — Foundation `(3주)`
> 동작하는 MVP

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 1주 | 프로젝트 셋업, kafkajs로 lag 수집 | `lagCollector.ts` 완성 |
| 2주 | 파티션별 테이블 출력, hot partition 감지 | CLI 기본 동작 |
| 3주 | produce/consume rate 샘플링 | `rateCollector.ts` 완성 |

### Phase 2 — Analyzer `(3주)`
> 원인 분류 로직

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 4주 | burst / slow detector | 원인 분류 출력 |
| 5주 | rebalance detector + suggestion 메시지 | 개선 제안 출력 |
| 6주 | `--watch` 모드 (N초마다 갱신) | 실시간 모니터링 |

### Phase 3 — Polish & Release `(2주)`
> npm 배포 + 오픈소스 준비

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 7주 | `--json` 출력, 에러 핸들링, 테스트 | CI 통과 |
| 8주 | README, npm publish, GitHub 릴리즈 | `npx kafka-why` 동작 |

**총 8주 / 주 5시간 = 약 40시간**

---

## 🚩 마일스톤

```
Week 3  →  kafka-why --broker x --group y  터미널에 lag 테이블 출력
Week 6  →  원인 분류 + --watch 모드
Week 8  →  npm publish, README, Star 받기 시작
```

---

## 🔭 향후 오픈소스 확장 아이디어 (v0.2+)

- `--alert slack-webhook` — lag 임계치 초과 시 Slack 알림
- `--export prometheus` — Prometheus metrics 엔드포인트
- GitHub Actions 연동 — 배포 후 lag 체크 자동화
- Schema drift 감지 기능 통합
