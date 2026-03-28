import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import type { RcFileSchema } from "../types/index.js";

const RC_FILENAME = ".klagrc";

const KNOWN_KEYS: (keyof RcFileSchema)[] = [
  "broker",
  "group",
  "interval",
  "timeout",
  "ssl",
  "sasl",
];

export interface LoadedConfig {
  config: RcFileSchema;
  loadedFrom: string;
}

/**
 * Searches for .klagrc in the current directory, then the home directory.
 * Returns null if no config file is found.
 */
export function loadConfig(): LoadedConfig | null {
  const candidates = [
    join(process.cwd(), RC_FILENAME),
    join(homedir(), RC_FILENAME),
  ];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      return { config: parseConfig(filePath), loadedFrom: filePath };
    }
  }

  return null;
}

function parseConfig(filePath: string): RcFileSchema {
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    throw new Error(
      `Failed to parse ${filePath}\n   Make sure it contains valid JSON.`,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${filePath} must be a JSON object.`);
  }

  const obj = raw as Record<string, unknown>;

  // ── Unknown key warnings ──────────────────────────────────────
  const unknownKeys = Object.keys(obj).filter(
    (k) => !KNOWN_KEYS.includes(k as keyof RcFileSchema),
  );
  if (unknownKeys.length > 0) {
    console.error(
      chalk.yellow(
        `\n⚠  Unknown key(s) in ${filePath}: ${unknownKeys.join(", ")}\n`,
      ),
    );
  }

  // ── Type validation ───────────────────────────────────────────
  if (obj.broker !== undefined && typeof obj.broker !== "string") {
    throw new Error(`${filePath}: "broker" must be a string.`);
  }
  if (obj.group !== undefined && typeof obj.group !== "string") {
    throw new Error(`${filePath}: "group" must be a string.`);
  }
  if (obj.interval !== undefined && typeof obj.interval !== "number") {
    throw new Error(`${filePath}: "interval" must be a number.`);
  }
  if (obj.timeout !== undefined && typeof obj.timeout !== "number") {
    throw new Error(`${filePath}: "timeout" must be a number.`);
  }

  // ── Password in config warning ────────────────────────────────
  const sasl = obj.sasl as Record<string, unknown> | undefined;
  if (sasl?.password) {
    console.error(
      chalk.yellow(
        `\n⚠  Warning: SASL password found in ${filePath}.\n` +
          "   Storing passwords in config files is not recommended.\n" +
          "   Consider using the KLAG_SASL_PASSWORD environment variable instead.\n",
      ),
    );
  }

  return obj as RcFileSchema;
}
