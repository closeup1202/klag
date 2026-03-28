import { readFileSync } from "node:fs";
import { Kafka, logLevel } from "kafkajs";
import type { SASLOptions } from "kafkajs";
import type { KafkaOptions } from "../types/index.js";

/**
 * Creates a KafkaJS Kafka instance from KafkaOptions.
 * Handles SSL certificate loading and SASL config assembly.
 */
export function createKafkaClient(
  clientId: string,
  options: KafkaOptions,
): Kafka {
  return new Kafka({
    clientId,
    brokers: [options.broker],
    logLevel: logLevel.NOTHING,
    requestTimeout: options.timeoutMs ?? 5000,
    connectionTimeout: options.timeoutMs ?? 3000,
    retry: { retries: 1 },
    ...(options.ssl && { ssl: buildSslConfig(options.ssl) }),
    ...(options.sasl?.password && {
      sasl: buildSaslConfig(options.sasl as Required<NonNullable<KafkaOptions["sasl"]>>),
    }),
  });
}

function buildSaslConfig(sasl: Required<NonNullable<KafkaOptions["sasl"]>>): SASLOptions {
  const { mechanism, username, password } = sasl;
  if (mechanism === "plain") return { mechanism: "plain", username, password };
  if (mechanism === "scram-sha-256") return { mechanism: "scram-sha-256", username, password };
  return { mechanism: "scram-sha-512", username, password };
}

function buildSslConfig(ssl: KafkaOptions["ssl"]): boolean | object {
  if (!ssl) return {};

  // No custom certs — use system CA trust
  if (!ssl.caPath && !ssl.certPath && !ssl.keyPath) {
    return true;
  }

  return {
    ...(ssl.caPath && { ca: [readFileSync(ssl.caPath)] }),
    ...(ssl.certPath && { cert: readFileSync(ssl.certPath) }),
    ...(ssl.keyPath && { key: readFileSync(ssl.keyPath) }),
  };
}
