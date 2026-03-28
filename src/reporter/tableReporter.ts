import chalk from "chalk";
import type { HorizontalAlignment } from "cli-table3";
import Table from "cli-table3";
import type { LagSnapshot, RateSnapshot, RcaResult } from "../types/index.js";
import { classifyLag, formatDrainTime, VERSION } from "../types/index.js";

const LEVEL_ICON: Record<string, string> = {
  OK: chalk.green("🟢 OK  "),
  WARN: chalk.yellow("🟡 WARN"),
  HIGH: chalk.red("🔴 HIGH"),
};

function formatLag(lag: bigint): string {
  return lag.toLocaleString();
}

function formatRate(rate: number): string {
  return rate < 0.1 ? "0" : `${rate.toFixed(1)} msg/s`;
}

function formatTrend(lagDiff?: bigint): string {
  if (lagDiff === undefined) return chalk.gray("  -  ");
  if (lagDiff === 0n) return chalk.gray("  =  ");
  if (lagDiff > 0n) return chalk.red(`▲ +${lagDiff.toLocaleString()}`);
  return chalk.green(`▼ ${lagDiff.toLocaleString()}`);
}

function groupStatus(totalLag: bigint, totalConsumeRate?: number): string {
  const level = classifyLag(totalLag, totalConsumeRate);
  if (level === "OK") return chalk.green("✅ OK");
  if (level === "WARN") return chalk.yellow("⚠️  WARNING");
  return chalk.red("🚨 CRITICAL");
}

export function printLagTable(
  snapshot: LagSnapshot,
  rcaResults: RcaResult[] = [],
  rateSnapshot?: RateSnapshot,
  watchMode = false,
): void {
  const { groupId, broker, collectedAt, partitions, totalLag } = snapshot;

  // ── Header ──────────────────────────────────────────────────────
  if (!watchMode) {
    console.log("");
    console.log(chalk.bold.cyan("⚡ klag") + chalk.gray(`  v${VERSION}`));
    console.log("");
  }
  console.log(chalk.bold("🔍 Consumer Group: ") + chalk.white(groupId));
  console.log(chalk.bold("   Broker:         ") + chalk.white(broker));

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = collectedAt
    .toLocaleString("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace("T", " ");
  console.log(
    chalk.bold("   Collected At:   ") + chalk.gray(`${localTime} (${tz})`),
  );
  console.log("");

  // ── Build rate lookup (needed for both summary and table) ──────────
  const hasRate = !!rateSnapshot && rateSnapshot.partitions.length > 0;
  const hasTrend = watchMode;

  const rateMap = new Map<
    string,
    { produceRate: number; consumeRate: number }
  >();
  let totalConsumeRate: number | undefined;
  if (hasRate && rateSnapshot) {
    let sum = 0;
    for (const r of rateSnapshot.partitions) {
      rateMap.set(`${r.topic}-${r.partition}`, r);
      sum += r.consumeRate;
    }
    totalConsumeRate = sum;
  }

  // ── Group State Summary ────────────────────────────────────────────
  const status = groupStatus(totalLag, totalConsumeRate);
  const totalStr = chalk.bold(formatLag(totalLag));
  const drainStr =
    totalConsumeRate !== undefined
      ? `   Drain : ${chalk.cyan(formatDrainTime(totalLag, totalConsumeRate))}`
      : "";
  console.log(
    `   Group Status : ${status}   Total Lag : ${totalStr}${drainStr}`,
  );
  console.log("");

  const head = [
    chalk.bold("Topic"),
    chalk.bold("Partition"),
    chalk.bold("Committed Offset"),
    chalk.bold("Log-End Offset"),
    chalk.bold("Lag"),
    ...(hasTrend ? [chalk.bold("Trend")] : []),
    chalk.bold("Status"),
    ...(hasRate
      ? [
          chalk.bold("Drain"),
          chalk.bold("Produce Rate"),
          chalk.bold("Consume Rate"),
        ]
      : []),
  ];

  const table = new Table({
    head,
    colAligns: [
      "left",
      "right",
      "right",
      "right",
      "right",
      ...(hasTrend ? ["right"] : []),
      "center",
      ...(hasRate ? ["right", "right", "right"] : []),
    ] as HorizontalAlignment[],
    style: { head: [], border: ["grey"] },
  });

  let lastTopic = "";

  for (const p of partitions) {
    const rateEntry = rateMap.get(`${p.topic}-${p.partition}`);
    const level = classifyLag(p.lag, rateEntry?.consumeRate);
    const lagStr =
      level === "HIGH"
        ? chalk.red(formatLag(p.lag))
        : level === "WARN"
          ? chalk.yellow(formatLag(p.lag))
          : chalk.green(formatLag(p.lag));

    const rateColumns = hasRate
      ? [
          chalk.cyan(
            rateEntry !== undefined
              ? formatDrainTime(p.lag, rateEntry.consumeRate)
              : "—",
          ),
          chalk.yellow(formatRate(rateEntry?.produceRate ?? 0)),
          chalk.cyan(formatRate(rateEntry?.consumeRate ?? 0)),
        ]
      : [];

    const topicDisplay = p.topic !== lastTopic ? p.topic : "";
    lastTopic = p.topic;

    table.push([
      topicDisplay,
      String(p.partition),
      formatLag(p.committedOffset),
      formatLag(p.logEndOffset),
      lagStr,
      ...(hasTrend ? [formatTrend(p.lagDiff)] : []),
      LEVEL_ICON[level],
      ...rateColumns,
    ]);
  }

  console.log(table.toString());
  console.log("");

  // ── RCA Section ──────────────────────────────────────────────────
  if (rcaResults.length === 0) return;

  console.log(chalk.bold("🔎 Root Cause Analysis"));
  console.log("");

  for (const rca of rcaResults) {
    const typeLabel = `${chalk.bold.yellow(`   [${rca.type}]`)} ${chalk.white(rca.topic)}`;
    console.log(typeLabel);
    console.log(chalk.gray(`   → ${rca.description}`));
    console.log(chalk.cyan(`   → Suggestion: ${rca.suggestion}`));
    console.log("");
  }
}
