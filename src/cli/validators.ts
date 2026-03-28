import { existsSync } from "node:fs";
import { InvalidArgumentError } from "commander";
import type { SaslMechanism } from "../types/index.js";

const VALID_SASL_MECHANISMS: SaslMechanism[] = [
  "plain",
  "scram-sha-256",
  "scram-sha-512",
];

export function parseInterval(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError("--interval must be a number >= 1000ms.");
  }
  return parsed;
}

export function parseBroker(value: string): string {
  const match = /^[^:]+:(\d+)$/.exec(value);
  if (!match) {
    throw new InvalidArgumentError(
      "--broker format is invalid. Example: localhost:9092",
    );
  }
  const port = parseInt(match[1], 10);
  if (port < 1 || port > 65535) {
    throw new InvalidArgumentError(
      "--broker port must be between 1 and 65535.",
    );
  }
  return value;
}

export function parseTimeout(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError("--timeout must be a number >= 1000ms.");
  }
  return parsed;
}

export function parseSaslMechanism(value: string): SaslMechanism {
  if (!VALID_SASL_MECHANISMS.includes(value as SaslMechanism)) {
    throw new InvalidArgumentError(
      `--sasl-mechanism must be one of: ${VALID_SASL_MECHANISMS.join(", ")}.`,
    );
  }
  return value as SaslMechanism;
}

export function parseCertPath(value: string): string {
  if (!existsSync(value)) {
    throw new InvalidArgumentError(`Certificate file not found: ${value}`);
  }
  return value;
}
