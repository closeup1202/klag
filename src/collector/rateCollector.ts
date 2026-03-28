import { Kafka, logLevel } from "kafkajs";
import type {
  KafkaOptions,
  PartitionRate,
  RateSnapshot,
} from "../types/index.js";

/**
 * Calculate per-partition produce/consume rate via two samples
 *
 * How it works:
 *  t=0s  → snapshot1: collect logEndOffset, committedOffset
 *  wait N seconds
 *  t=Ns  → snapshot2: collect logEndOffset, committedOffset
 *
 *  produceRate = (logEnd2 - logEnd1) / intervalSec      (msg/s)
 *  consumeRate = (committed2 - committed1) / intervalSec (msg/s)
 */
export async function collectRate(
  options: KafkaOptions,
  knownTopics?: string[],
): Promise<RateSnapshot> {
  const intervalMs = options.intervalMs ?? 5000;
  const intervalSec = intervalMs / 1000;

  const kafka = new Kafka({
    clientId: "klag-rate",
    brokers: [options.broker],
    logLevel: logLevel.NOTHING,
    requestTimeout: options.timeoutMs ?? 5000,
    connectionTimeout: options.timeoutMs ?? 3000,
    retry: {
      retries: 1, // Added — only 1 retry (default is 5)
    },
  });

  const admin = kafka.admin();

  try {
    await admin.connect();

    // ── Fetch topic list ──────────────────────────────────────────
    const committedRaw = await admin.fetchOffsets(
      knownTopics && knownTopics.length > 0
        ? { groupId: options.groupId, topics: knownTopics }
        : { groupId: options.groupId },
    );

    const topics = committedRaw.map((t) => t.topic);

    if (topics.length === 0) {
      return { intervalMs, partitions: [] };
    }

    // ── Collect snapshot1 ─────────────────────────────────────────
    const logEnd1 = await fetchLogEndOffsets(admin, topics);
    const committed1 = buildCommittedMap(committedRaw);

    // ── Wait N seconds ────────────────────────────────────────────
    await sleep(intervalMs);

    // ── Collect snapshot2 ─────────────────────────────────────────
    const committedRaw2 = await admin.fetchOffsets({
      groupId: options.groupId,
      topics,
    });
    const logEnd2 = await fetchLogEndOffsets(admin, topics);
    const committed2 = buildCommittedMap(committedRaw2);

    // ── Calculate rates ───────────────────────────────────────────
    const partitions: PartitionRate[] = [];

    for (const topic of topics) {
      const end1 = logEnd1.get(topic) ?? new Map();
      const end2 = logEnd2.get(topic) ?? new Map();
      const com1 = committed1.get(topic) ?? new Map();
      const com2 = committed2.get(topic) ?? new Map();

      const allPartitions = new Set([...end1.keys(), ...end2.keys()]);

      for (const partition of allPartitions) {
        const logEndDiff =
          (end2.get(partition) ?? 0n) - (end1.get(partition) ?? 0n);
        const committedDiff =
          (com2.get(partition) ?? 0n) - (com1.get(partition) ?? 0n);

        // Number() is safe here: offset diffs over a single sampling window are
        // far below Number.MAX_SAFE_INTEGER (2^53), even at very high throughput.
        partitions.push({
          topic,
          partition,
          produceRate: Math.max(0, Number(logEndDiff) / intervalSec),
          consumeRate: Math.max(0, Number(committedDiff) / intervalSec),
        });
      }
    }

    // Sort by topic → partition
    partitions.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.partition - b.partition,
    );

    return { intervalMs, partitions };
  } finally {
    await admin.disconnect();
  }
}

// ── Helper functions ──────────────────────────────────────────────

async function fetchLogEndOffsets(
  admin: ReturnType<InstanceType<typeof Kafka>["admin"]>,
  topics: string[],
): Promise<Map<string, Map<number, bigint>>> {
  const entries = await Promise.all(
    topics.map(async (topic) => {
      const offsets = await admin.fetchTopicOffsets(topic);
      const partitionMap = new Map<number, bigint>();
      for (const p of offsets) {
        partitionMap.set(p.partition, BigInt(p.offset));
      }
      return [topic, partitionMap] as const;
    }),
  );
  return new Map(entries);
}

function buildCommittedMap(
  raw: { topic: string; partitions: { partition: number; offset: string }[] }[],
): Map<string, Map<number, bigint>> {
  const result = new Map<string, Map<number, bigint>>();
  for (const topicOffset of raw) {
    const partitionMap = new Map<number, bigint>();
    for (const p of topicOffset.partitions) {
      partitionMap.set(p.partition, p.offset === "-1" ? 0n : BigInt(p.offset));
    }
    result.set(topicOffset.topic, partitionMap);
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
Key points:

snapshot1 → wait 5s → snapshot2

produceRate = (logEnd2 - logEnd1) / 5      → rate at which messages accumulate on the broker
consumeRate = (committed2 - committed1) / 5 → rate at which the consumer processes messages

produceRate 200 msg/s, consumeRate 50 msg/s
→ consumer cannot keep up → lag keeps growing
*/
