import { Kafka, logLevel } from 'kafkajs'
import type { KafkaOptions, RateSnapshot, PartitionRate } from '../types/index.js'

/**
 * 2번 샘플링으로 파티션별 produce/consume rate 계산
 *
 * 동작 원리:
 *  t=0s  → snapshot1: logEndOffset, committedOffset 수집
 *  N초 대기
 *  t=Ns  → snapshot2: logEndOffset, committedOffset 수집
 *
 *  produceRate = (logEnd2 - logEnd1) / intervalSec      (msg/s)
 *  consumeRate = (committed2 - committed1) / intervalSec (msg/s)
 */
export async function collectRate(options: KafkaOptions): Promise<RateSnapshot> {
  const intervalMs = options.intervalMs ?? 5000
  const intervalSec = intervalMs / 1000

  const kafka = new Kafka({
    clientId: 'kafka-why-rate',
    brokers: [options.broker],
    logLevel: logLevel.NOTHING,
    requestTimeout: 5000,      // 추가 — 요청 타임아웃 5초
    connectionTimeout: 3000,   // 추가 — 연결 타임아웃 3초
    retry: {
      retries: 1,              // 추가 — 재시도 1번만 (기본 5번)
    },
  })

  const admin = kafka.admin()

  try {
    await admin.connect()

    // ── 공통: topic 목록 조회 ──────────────────────────────────────
    const committedRaw = await admin.fetchOffsets({
      groupId: options.groupId,
    })

    const topics = committedRaw.map((t) => t.topic)

    if (topics.length === 0) {
      return { intervalMs, partitions: [] }
    }

    // ── snapshot1 수집 ─────────────────────────────────────────────
    const logEnd1 = await fetchLogEndOffsets(admin, topics)
    const committed1 = buildCommittedMap(committedRaw)

    // ── N초 대기 ──────────────────────────────────────────────────
    process.stdout.write(
      `\r  Sampling rates... (waiting ${intervalSec}s)   `
    )
    await sleep(intervalMs)

    // ── snapshot2 수집 ─────────────────────────────────────────────
    const committedRaw2 = await admin.fetchOffsets({
      groupId: options.groupId,
    })
    const logEnd2 = await fetchLogEndOffsets(admin, topics)
    const committed2 = buildCommittedMap(committedRaw2)

    process.stdout.write('\r' + ' '.repeat(50) + '\r')

    // ── rate 계산 ──────────────────────────────────────────────────
    const partitions: PartitionRate[] = []

    for (const topic of topics) {
      const end1 = logEnd1.get(topic) ?? new Map()
      const end2 = logEnd2.get(topic) ?? new Map()
      const com1 = committed1.get(topic) ?? new Map()
      const com2 = committed2.get(topic) ?? new Map()

      const allPartitions = new Set([...end1.keys(), ...end2.keys()])

      for (const partition of allPartitions) {
        const logEndDiff = (end2.get(partition) ?? 0n) - (end1.get(partition) ?? 0n)
        const committedDiff = (com2.get(partition) ?? 0n) - (com1.get(partition) ?? 0n)

        partitions.push({
          topic,
          partition,
          produceRate: Math.max(0, Number(logEndDiff) / intervalSec),
          consumeRate: Math.max(0, Number(committedDiff) / intervalSec),
        })
      }
    }

    // topic → partition 순 정렬
    partitions.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.partition - b.partition
    )

    return { intervalMs, partitions }
  } finally {
    await admin.disconnect()
  }
}

// ── 헬퍼 함수들 ───────────────────────────────────────────────────

async function fetchLogEndOffsets(
  admin: ReturnType<InstanceType<typeof Kafka>['admin']>,
  topics: string[]
): Promise<Map<string, Map<number, bigint>>> {
  const result = new Map<string, Map<number, bigint>>()
  for (const topic of topics) {
    const offsets = await admin.fetchTopicOffsets(topic)
    const partitionMap = new Map<number, bigint>()
    for (const p of offsets) {
      partitionMap.set(p.partition, BigInt(p.offset))
    }
    result.set(topic, partitionMap)
  }
  return result
}

function buildCommittedMap(
  raw: { topic: string; partitions: { partition: number; offset: string }[] }[]
): Map<string, Map<number, bigint>> {
  const result = new Map<string, Map<number, bigint>>()
  for (const topicOffset of raw) {
    const partitionMap = new Map<number, bigint>()
    for (const p of topicOffset.partitions) {
      partitionMap.set(
        p.partition,
        p.offset === '-1' ? 0n : BigInt(p.offset)
      )
    }
    result.set(topicOffset.topic, partitionMap)
  }
  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* 
핵심 포인트:

snapshot1 → 5초 대기 → snapshot2

produceRate = (logEnd2 - logEnd1) / 5     → broker에 쌓이는 속도
consumeRate = (committed2 - committed1) / 5 → consumer 처리 속도

produceRate 200 msg/s, consumeRate 50 msg/s
→ consumer가 따라가지 못함 → lag 계속 증가 
*/