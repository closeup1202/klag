process.removeAllListeners("warning");

import chalk from "chalk";
import { Command } from "commander";
import { analyze } from "../analyzer/index.js";
import { collectLag } from "../collector/lagCollector.js";
import { collectRate } from "../collector/rateCollector.js";
import { printLagTable } from "../reporter/tableReporter.js";
import type { RateSnapshot } from "../types/index.js";
import { VERSION } from "../types/index.js";
import { buildAuthOptions } from "./authBuilder.js";
import { loadConfig } from "./configLoader.js";
import { pickGroup } from "./groupPicker.js";
import {
  parseBroker,
  parseCertPath,
  parseInterval,
  parseSaslMechanism,
  parseTimeout,
} from "./validators.js";
import { startWatch } from "./watcher.js";

const program = new Command();

program
  .name("klag")
  .description("Kafka consumer lag root cause analyzer")
  .version(VERSION)
  .requiredOption(
    "-b, --broker <host:port>",
    "Kafka broker address",
    parseBroker,
    "localhost:9092",
  )
  .option(
    "-g, --group <groupId>",
    "Consumer group ID (omit to pick interactively)",
  )
  .option(
    "-i, --interval <ms>",
    "Rate sampling interval in ms",
    parseInterval,
    5000,
  )
  .option("-w, --watch", "Watch mode — refresh every interval")
  .option("-t, --timeout <ms>", "Connection timeout in ms", parseTimeout, 5000)
  .option(
    "--no-rate",
    "Skip rate sampling (faster, no PRODUCER_BURST detection)",
  )
  .option("--json", "Output raw JSON instead of table")
  // ── SSL options ────────────────────────────────────────────────────────
  .option("--ssl", "Enable SSL/TLS (uses system CA trust)")
  .option("--ssl-ca <path>", "Path to CA certificate PEM file", parseCertPath)
  .option(
    "--ssl-cert <path>",
    "Path to client certificate PEM file",
    parseCertPath,
  )
  .option("--ssl-key <path>", "Path to client key PEM file", parseCertPath)
  // ── SASL options ───────────────────────────────────────────────────────
  .option(
    "--sasl-mechanism <mechanism>",
    "SASL mechanism: plain, scram-sha-256, scram-sha-512",
    parseSaslMechanism,
  )
  .option("--sasl-username <username>", "SASL username")
  .option(
    "--sasl-password <password>",
    "SASL password (prefer KLAG_SASL_PASSWORD env var)",
  )
  .action(async (options) => {
    try {
      // ── Load .klagrc (current dir → home dir) ──────────────────
      const loaded = loadConfig();
      const rc = loaded?.config ?? {};

      if (loaded) {
        process.stderr.write(
          chalk.gray(`  Using config: ${loaded.loadedFrom}\n`),
        );
      }

      // ── Merge: CLI args take precedence over .klagrc ───────────
      const broker =
        options.broker !== "localhost:9092"
          ? options.broker
          : (rc.broker ?? options.broker);
      const intervalMs =
        options.interval !== 5000
          ? options.interval
          : (rc.interval ?? options.interval);
      const timeoutMs =
        options.timeout !== 5000
          ? options.timeout
          : (rc.timeout ?? options.timeout);

      // ── Build SSL/SASL from CLI flags (override .klagrc) ───────
      const auth = buildAuthOptions({
        ssl: options.ssl || rc.ssl?.enabled,
        sslCa: options.sslCa ?? rc.ssl?.caPath,
        sslCert: options.sslCert ?? rc.ssl?.certPath,
        sslKey: options.sslKey ?? rc.ssl?.keyPath,
        saslMechanism: options.saslMechanism ?? rc.sasl?.mechanism,
        saslUsername: options.saslUsername ?? rc.sasl?.username,
        saslPassword: options.saslPassword ?? rc.sasl?.password,
      });

      const baseOptions = { broker, intervalMs, timeoutMs, ...auth };

      // ── Resolve group ID: CLI > .klagrc > interactive picker ───
      const groupId =
        options.group ?? rc.group ?? (await pickGroup(baseOptions));

      const kafkaOptions = { ...baseOptions, groupId };

      // ── watch mode ─────────────────────────────────────────────
      if (options.watch) {
        await startWatch(kafkaOptions, options.rate === false);
        return;
      }

      // ── general mode ──────────────────────────────────────────────
      process.stdout.write(chalk.gray("  Connecting to broker..."));

      const snapshot = await collectLag(kafkaOptions);

      process.stdout.write(`\r${" ".repeat(50)}\r`);

      let rateSnapshot: RateSnapshot | undefined;
      if (options.rate !== false) {
        const topics = [...new Set(snapshot.partitions.map((p) => p.topic))];
        const waitSec = (kafkaOptions.intervalMs ?? 5000) / 1000;
        process.stdout.write(
          chalk.gray(`  Sampling rates... (waiting ${waitSec}s)   `),
        );
        rateSnapshot = await collectRate(kafkaOptions, topics);
        process.stdout.write(`\r${" ".repeat(50)}\r`);
      }

      const rcaResults = analyze(snapshot, rateSnapshot);

      if (options.json) {
        const serializable = {
          ...snapshot,
          totalLag: snapshot.totalLag.toString(),
          partitions: snapshot.partitions.map((p) => ({
            ...p,
            lag: p.lag.toString(),
            logEndOffset: p.logEndOffset.toString(),
            committedOffset: p.committedOffset.toString(),
          })),
          rate: rateSnapshot,
          rca: rcaResults,
        };
        console.log(JSON.stringify(serializable, null, 2));
      } else {
        printLagTable(snapshot, rcaResults, rateSnapshot);
      }

      process.exit(0);
    } catch (err) {
      process.stdout.write(`\r${" ".repeat(50)}\r`);
      const message = err instanceof Error ? err.message : String(err);

      // No Broker
      if (
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("Connection error") ||
        message.includes("connect ECONNREFUSED")
      ) {
        console.error(chalk.red(`\n❌ Cannot connect to broker\n`));
        console.error(chalk.yellow("   Check the following:"));
        console.error(chalk.gray(`   • Is Kafka running: docker ps`));
        console.error(chalk.gray(`   • Broker address: ${options.broker}`));
        console.error(
          chalk.gray(
            `   • Port accessibility: nc -zv ${options.broker.split(":")[0]} ${options.broker.split(":")[1]}`,
          ),
        );
        console.error("");
        process.exit(1);
      }

      // SASL auth failure
      if (
        message.includes("SASLAuthenticationFailed") ||
        message.includes("Authentication failed") ||
        message.includes("SASL")
      ) {
        console.error(chalk.red(`\n❌ SASL authentication failed\n`));
        console.error(chalk.yellow("   Check the following:"));
        console.error(
          chalk.gray(`   • Mechanism: ${options.saslMechanism ?? "(none)"}`),
        );
        console.error(
          chalk.gray(`   • Username:  ${options.saslUsername ?? "(none)"}`),
        );
        console.error(
          chalk.gray(
            `   • Password:  set via KLAG_SASL_PASSWORD or --sasl-password`,
          ),
        );
        console.error("");
        process.exit(1);
      }

      // No group
      if (message.includes("not found") || message.includes("Dead state")) {
        console.error(chalk.red(`\n❌ Consumer group not found\n`));
        console.error(chalk.yellow("   Check the following:"));
        console.error(chalk.gray(`   • Group ID: ${options.group}`));
        console.error(chalk.gray(`   • List existing groups:`));
        console.error(
          chalk.gray(
            `     kafka-consumer-groups.sh --bootstrap-server ${options.broker} --list`,
          ),
        );
        console.error("");
        process.exit(1);
      }

      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

program.parse();
