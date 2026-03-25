import { Kafka, logLevel, AssignerProtocol } from 'kafkajs'
import type { KafkaOptions, LagSnapshot, PartitionLag } from '../types/index.js'

/**
 * Kafka AdminClient를 사용해 consumer group의 파티션별 lag을 수집
 *
 * 동작 원리:
 *  1. describeGroups  → consumer group이 구독 중인 topic/partition 목록 파악
 *  2. fetchOffsets    → consumer가 마지막으로 커밋한 offset (committedOffset)
 *  3. fetchTopicOffsets → broker의 최신 offset (logEndOffset)
 *  4. lag = logEndOffset - committedOffset
 */
export async function collectLag(options: KafkaOptions): Promise<LagSnapshot> {
  const kafka = new Kafka({
    clientId: 'kafka-why',
    brokers: [options.broker],
    logLevel: logLevel.NOTHING, // CLI에서 kafkajs 내부 로그 숨김
  })

  const admin = kafka.admin()

  try {
    await admin.connect()

    // ── 1. consumer group이 구독 중인 topic/partition 파악 ────────
    const groupDescription = await admin.describeGroups([options.groupId])
    const group = groupDescription.groups[0]

    if (!group) {
      throw new Error(`Consumer group "${options.groupId}" not found`)
    }

    if (group.state === 'Dead') {
      throw new Error(`Consumer group "${options.groupId}" is in Dead state`)
    }

    // member들의 topic/partition 할당 정보 수집
    const topicPartitionMap = new Map<string, Set<number>>()

    for (const member of group.members) {
      if (!member.memberAssignment) continue
      const decoded = AssignerProtocol.MemberAssignment.decode(
        member.memberAssignment
      )

      for (const [topic, partitions] of Object.entries(decoded!.assignment)) {
        if (!topicPartitionMap.has(topic)) {
          topicPartitionMap.set(topic, new Set())
        }
        for (const p of partitions as number[]) {
          topicPartitionMap.get(topic)!.add(p)
        }
      }
    }

    // ── 2. committed offset 조회 ──────────────────────────────────
    const topicNames = [...topicPartitionMap.keys()]

    const committedOffsets = await admin.fetchOffsets({
      groupId: options.groupId,
      topics: topicNames.length > 0 ? topicNames : undefined,
    })

    // group이 Empty 상태일 때 fetchOffsets 결과로 topic/partition 보완
    for (const topicOffset of committedOffsets) {
      if (!topicPartitionMap.has(topicOffset.topic)) {
        topicPartitionMap.set(topicOffset.topic, new Set())
      }
      for (const p of topicOffset.partitions) {
        topicPartitionMap.get(topicOffset.topic)!.add(p.partition)
      }
    }

    // ── 3. log-end offset (broker 최신 offset) 조회 ───────────────
    const logEndOffsetMap = new Map<string, Map<number, bigint>>()

    for (const [topic] of topicPartitionMap) {
      const offsets = await admin.fetchTopicOffsets(topic)
      const partitionMap = new Map<number, bigint>()
      for (const p of offsets) {
        partitionMap.set(p.partition, BigInt(p.offset))
      }
      logEndOffsetMap.set(topic, partitionMap)
    }

    // committedOffset Map 구성
    const committedOffsetMap = new Map<string, Map<number, bigint>>()
    
    for (const topicOffset of committedOffsets) {
      const partitionMap = new Map<number, bigint>()
      for (const p of topicOffset.partitions) {
        // -1은 아직 커밋된 offset이 없음 → 0으로 처리
        const offset = p.offset === '-1' ? 0n : BigInt(p.offset)
        partitionMap.set(p.partition, offset)
      }
      committedOffsetMap.set(topicOffset.topic, partitionMap)
    }

    // ── 4. 파티션별 lag 계산 ──────────────────────────────────────
    const partitions: PartitionLag[] = []

    for (const [topic, partitionSet] of topicPartitionMap) {
      const logEndMap = logEndOffsetMap.get(topic) ?? new Map<number, bigint>()
      const commitMap = committedOffsetMap.get(topic) ?? new Map<number, bigint>()

      for (const partition of partitionSet) {
        const logEndOffset = logEndMap.get(partition) ?? 0n
        const committedOffset = commitMap.get(partition) ?? 0n
        const lag =
          logEndOffset > committedOffset
            ? (logEndOffset - committedOffset)
            : 0n

        partitions.push({ topic, partition, logEndOffset, committedOffset, lag })
      }
    }

    // topic → partition 번호 순 정렬
    partitions.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.partition - b.partition
    )

    const totalLag = partitions.reduce((sum, p) => sum + p.lag, 0n)

    return {
      groupId: options.groupId,
      broker: options.broker,
      collectedAt: new Date(),
      partitions,
      totalLag,
    }
  } finally {
    // 성공/실패 상관없이 항상 연결 해제
    await admin.disconnect()
  }
}