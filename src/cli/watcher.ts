import chalk from "chalk";
import { analyze } from "../analyzer/index.js";
import { collectLag } from "../collector/lagCollector.js";
import { collectRate } from "../collector/rateCollector.js";
import { printLagTable } from "../reporter/tableReporter.js";
import type {
  KafkaOptions,
  LagSnapshot,
  RateSnapshot,
} from "../types/index.js";
import { VERSION } from "../types/index.js";

const MAX_RETRIES = 3;

function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

function printWatchHeader(intervalMs: number, updatedAt: Date): void {
  const intervalSec = intervalMs / 1000;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeStr = updatedAt.toLocaleString("sv-SE", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  console.log(
    chalk.bold.cyan("⚡ klag") +
      chalk.gray(`  v${VERSION}`) +
      "  │  " +
      chalk.yellow("watch mode") +
      "  │  " +
      chalk.gray(`${intervalSec}s refresh`) +
      "  │  " +
      chalk.gray("Ctrl+C to exit"),
  );
  console.log(chalk.gray(`   Last updated: ${timeStr} (${tz})`));
}

function printWatchError(
  message: string,
  retryCount: number,
  retryIn: number,
): void {
  clearScreen();
  console.log(
    chalk.bold.cyan("⚡ klag") +
      chalk.gray(`  v${VERSION}`) +
      "  │  " +
      chalk.yellow("watch mode") +
      "  │  " +
      chalk.gray("Ctrl+C to exit"),
  );
  console.log("");
  console.error(chalk.red(`   ❌ Error: ${message}`));
  console.log(
    chalk.yellow(`   Retrying ${retryCount}/${MAX_RETRIES}... in ${retryIn}s`),
  );
  console.log("");
}

function printWatchFatal(message: string): void {
  clearScreen();
  console.log(
    chalk.bold.cyan("⚡ klag") +
      chalk.gray(`  v${VERSION}`) +
      "  │  " +
      chalk.yellow("watch mode"),
  );
  console.log("");
  console.error(chalk.red(`   ❌ Error: ${message}`));
  console.error(
    chalk.red(`   All ${MAX_RETRIES} retries failed — exiting watch mode`),
  );
  console.log("");
}

// ── Calculate lagDiff by comparing against the previous snapshot ──
function applyDiff(current: LagSnapshot, previous: LagSnapshot): LagSnapshot {
  const prevMap = new Map<string, bigint>();
  for (const p of previous.partitions) {
    prevMap.set(`${p.topic}-${p.partition}`, p.lag);
  }

  const partitions = current.partitions.map((p) => {
    const prevLag = prevMap.get(`${p.topic}-${p.partition}`);
    const lagDiff = prevLag !== undefined ? p.lag - prevLag : undefined;
    return { ...p, lagDiff };
  });

  return { ...current, partitions };
}

async function runOnce(
  options: KafkaOptions,
  noRate: boolean,
  previous?: LagSnapshot,
): Promise<LagSnapshot> {
  const snapshot = await collectLag(options);

  let rateSnapshot: RateSnapshot | undefined;
  if (!noRate) {
    const topics = [...new Set(snapshot.partitions.map((p) => p.topic))];
    const waitSec = (options.intervalMs ?? 5000) / 1000;
    process.stdout.write(
      chalk.gray(`  Sampling rates... (waiting ${waitSec}s)   `),
    );
    rateSnapshot = await collectRate(options, topics);
    process.stdout.write(`\r${" ".repeat(50)}\r`);
  }

  const rcaResults = analyze(snapshot, rateSnapshot);

  // Apply diff only when a previous snapshot exists
  const snapshotWithDiff = previous ? applyDiff(snapshot, previous) : snapshot;

  clearScreen();
  printWatchHeader(options.intervalMs ?? 5000, snapshot.collectedAt);
  printLagTable(snapshotWithDiff, rcaResults, rateSnapshot, true);

  return snapshot; // Return the original (no diff) for use in the next iteration
}

function printCountdown(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = seconds;

    const tick = (): void => {
      process.stdout.write(
        `\r${chalk.gray(`   [●] Next refresh in ${remaining}s...`)}   `,
      );
      if (remaining === 0) {
        process.stdout.write(`\r${" ".repeat(40)}\r`);
        resolve();
        return;
      }
      remaining--;
      setTimeout(tick, 1000);
    };

    tick();
  });
}

function getFriendlyMessage(err: unknown, broker: string): string {
  const message = err instanceof Error ? err.message : String(err);

  if (
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection error")
  ) {
    return `Cannot connect to broker (${broker})`;
  }

  if (message.includes("Dead state") || message.includes("not found")) {
    return `Consumer group not found`;
  }

  return message;
}

export async function startWatch(
  options: KafkaOptions,
  noRate: boolean,
): Promise<void> {
  process.on("SIGINT", () => {
    console.log(chalk.gray("\n\n  Watch mode exited\n"));
    process.exit(0);
  });

  const intervalMs = options.intervalMs ?? 5000;
  const waitSec = Math.ceil(intervalMs / 1000);

  process.stdout.write(chalk.gray("  Connecting to broker..."));

  let errorCount = 0;
  let previousSnapshot: LagSnapshot | undefined;

  while (true) {
    try {
      // Pass previous snapshot so lagDiff can be calculated
      previousSnapshot = await runOnce(options, noRate, previousSnapshot);
      errorCount = 0;
      // When rate sampling was performed, collectRate already waited intervalMs —
      // skip the countdown to avoid doubling the cycle time
      if (noRate) {
        await printCountdown(waitSec);
      }
    } catch (err) {
      errorCount++;
      const message = getFriendlyMessage(err, options.broker);

      if (errorCount >= MAX_RETRIES) {
        printWatchFatal(message);
        process.exit(1);
      }

      printWatchError(message, errorCount, waitSec);
      await printCountdown(waitSec);
    }
  }
}
