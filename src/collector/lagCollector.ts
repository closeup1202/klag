import { AssignerProtocol, Kafka, logLevel } from "kafkajs";
import type {
  KafkaOptions,
  LagSnapshot,
  PartitionLag,
} from "../types/index.js";

/**
 * Collects per-partition lag for a consumer group using Kafka AdminClient
 *
 * How it works:
 *  1. describeGroups     → get the list of topics/partitions subscribed by the consumer group
 *  2. fetchOffsets       → last committed offset by the consumer (committedOffset)
 *  3. fetchTopicOffsets  → latest offset on the broker (logEndOffset)
 *  4. lag = logEndOffset - committedOffset
 */
export async function collectLag(options: KafkaOptions): Promise<LagSnapshot> {
  const kafka = new Kafka({
    clientId: "klag",
    brokers: [options.broker],
    logLevel: logLevel.NOTHING, // Hide kafkajs internal logs in CLI
    requestTimeout: options.timeoutMs ?? 5000,
    connectionTimeout: options.timeoutMs ?? 3000,
    retry: {
      retries: 1, // Added — only 1 retry (default is 5)
    },
  });

  const admin = kafka.admin();

  try {
    await admin.connect();

    // ── 1. Determine subscribed topics/partitions of consumer group ──
    const groupDescription = await admin.describeGroups([options.groupId]);
    const group = groupDescription.groups[0];

    if (!group) {
      throw new Error(`Consumer group "${options.groupId}" not found`);
    }

    if (group.state === "Dead") {
      throw new Error(`Consumer group "${options.groupId}" is in Dead state`);
    }

    // Collect topic/partition assignment info for all members
    const topicPartitionMap = new Map<string, Set<number>>();

    for (const member of group.members) {
      if (!member.memberAssignment) continue;
      // AssignerProtocol is not a formally stable public API — wrap decode so
      // that a future KafkaJS change degrades gracefully to fetchOffsets fallback.
      try {
        const decoded = AssignerProtocol.MemberAssignment.decode(
          member.memberAssignment,
        );
        for (const [topic, partitions] of Object.entries(decoded?.assignment)) {
          if (!topicPartitionMap.has(topic)) {
            topicPartitionMap.set(topic, new Set());
          }
          for (const p of partitions as number[]) {
            topicPartitionMap.get(topic)?.add(p);
          }
        }
      } catch {
        // Decode failed — topic/partition info will be supplemented from
        // fetchOffsets below (covers Empty-state groups too).
      }
    }

    // ── 2. Fetch committed offsets ────────────────────────────────
    const topicNames = [...topicPartitionMap.keys()];

    const committedOffsets = await admin.fetchOffsets({
      groupId: options.groupId,
      topics: topicNames.length > 0 ? topicNames : undefined,
    });

    // Supplement topic/partition data from fetchOffsets when group is in Empty state
    for (const topicOffset of committedOffsets) {
      if (!topicPartitionMap.has(topicOffset.topic)) {
        topicPartitionMap.set(topicOffset.topic, new Set());
      }
      for (const p of topicOffset.partitions) {
        topicPartitionMap.get(topicOffset.topic)?.add(p.partition);
      }
    }

    // ── 3. Fetch log-end offsets (latest broker offset) ───────────
    const topicList = [...topicPartitionMap.keys()];
    const logEndEntries = await Promise.all(
      topicList.map(async (topic) => {
        const offsets = await admin.fetchTopicOffsets(topic);
        const partitionMap = new Map<number, bigint>();
        for (const p of offsets) {
          partitionMap.set(p.partition, BigInt(p.offset));
        }
        return [topic, partitionMap] as const;
      }),
    );
    const logEndOffsetMap = new Map(logEndEntries);

    // Build committedOffset map
    const committedOffsetMap = new Map<string, Map<number, bigint>>();

    for (const topicOffset of committedOffsets) {
      const partitionMap = new Map<number, bigint>();
      for (const p of topicOffset.partitions) {
        // -1 means no offset committed yet → treat as 0
        const offset = p.offset === "-1" ? 0n : BigInt(p.offset);
        partitionMap.set(p.partition, offset);
      }
      committedOffsetMap.set(topicOffset.topic, partitionMap);
    }

    // ── 4. Calculate per-partition lag ────────────────────────────
    const partitions: PartitionLag[] = [];

    for (const [topic, partitionSet] of topicPartitionMap) {
      const logEndMap = logEndOffsetMap.get(topic) ?? new Map<number, bigint>();
      const commitMap =
        committedOffsetMap.get(topic) ?? new Map<number, bigint>();

      for (const partition of partitionSet) {
        const logEndOffset = logEndMap.get(partition) ?? 0n;
        const committedOffset = commitMap.get(partition) ?? 0n;
        const lag =
          logEndOffset > committedOffset ? logEndOffset - committedOffset : 0n;

        partitions.push({
          topic,
          partition,
          logEndOffset,
          committedOffset,
          lag,
        });
      }
    }

    // Sort by topic → partition number
    partitions.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.partition - b.partition,
    );

    const totalLag = partitions.reduce((sum, p) => sum + p.lag, 0n);

    return {
      groupId: options.groupId,
      broker: options.broker,
      collectedAt: new Date(),
      partitions,
      totalLag,
      groupState: group.state,
    };
  } finally {
    // Always disconnect regardless of success or failure
    await admin.disconnect();
  }
}
