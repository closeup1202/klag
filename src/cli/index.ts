process.removeAllListeners("warning");

import chalk from "chalk";
import { Command } from "commander";
import { analyze } from "../analyzer/index.js";
import { collectLag } from "../collector/lagCollector.js";
import { collectRate } from "../collector/rateCollector.js";
import { printLagTable } from "../reporter/tableReporter.js";
import type { RateSnapshot } from "../types/index.js";
import { VERSION } from "../types/index.js";
import { parseBroker, parseInterval, parseTimeout } from "./validators.js";
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
  .requiredOption("-g, --group <groupId>", "Consumer group ID")
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
  .action(async (options) => {
    try {
      const kafkaOptions = {
        broker: options.broker,
        groupId: options.group,
        intervalMs: options.interval,
        timeoutMs: options.timeout,
      };

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
