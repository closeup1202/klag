import chalk from "chalk";
import prompts from "prompts";
import { createKafkaClient } from "../collector/kafkaFactory.js";
import type { KafkaOptions } from "../types/index.js";

const GROUP_STATE_ORDER: Record<string, number> = {
  Stable: 0,
  Empty: 1,
  PreparingRebalance: 2,
  CompletingRebalance: 3,
  Dead: 4,
};

/**
 * Fetches all consumer groups from the broker and presents an interactive
 * selection prompt. Returns the chosen group ID, or exits if the user cancels.
 */
export async function pickGroup(
  options: Omit<KafkaOptions, "groupId">,
): Promise<string> {
  const kafka = createKafkaClient("klag-picker", { ...options, groupId: "" });
  const admin = kafka.admin();

  process.stdout.write(chalk.gray("  Fetching consumer groups..."));

  let groups: { groupId: string; protocolType: string }[] = [];

  try {
    await admin.connect();
    const result = await admin.listGroups();
    groups = result.groups;
  } finally {
    await admin.disconnect();
  }

  process.stdout.write(`\r${" ".repeat(40)}\r`);

  if (groups.length === 0) {
    console.error(chalk.red("\n❌ No consumer groups found on this broker\n"));
    process.exit(1);
  }

  // Fetch state for each group to show alongside the name
  const kafka2 = createKafkaClient("klag-picker-desc", {
    ...options,
    groupId: "",
  });
  const admin2 = kafka2.admin();

  process.stdout.write(chalk.gray("  Loading group states...  "));

  const stateMap = new Map<string, string>();

  try {
    await admin2.connect();
    const groupIds = groups.map((g) => g.groupId);
    const described = await admin2.describeGroups(groupIds);
    for (const g of described.groups) {
      stateMap.set(g.groupId, g.state);
    }
  } catch {
    // State info is best-effort — fall back to showing group IDs only
  } finally {
    await admin2.disconnect();
  }

  process.stdout.write(`\r${" ".repeat(40)}\r`);

  // Sort: Stable first, Dead last, then alphabetically within each state
  const sorted = [...groups].sort((a, b) => {
    const stateA = GROUP_STATE_ORDER[stateMap.get(a.groupId) ?? ""] ?? 99;
    const stateB = GROUP_STATE_ORDER[stateMap.get(b.groupId) ?? ""] ?? 99;
    return stateA !== stateB
      ? stateA - stateB
      : a.groupId.localeCompare(b.groupId);
  });

  const choices = sorted.map((g) => {
    const state = stateMap.get(g.groupId);
    const stateLabel = state ? stateColor(state) : chalk.gray("unknown");
    return {
      title: `${g.groupId}  ${stateLabel}`,
      value: g.groupId,
    };
  });

  console.log("");

  const response = await prompts(
    {
      type: "autocomplete",
      name: "groupId",
      message: "Select a consumer group",
      choices,
      suggest: (input, choices) =>
        Promise.resolve(
          choices.filter((c) =>
            c.value.toLowerCase().includes(input.toLowerCase()),
          ),
        ),
    },
    {
      onCancel: () => {
        console.log(chalk.gray("\n  Cancelled\n"));
        process.exit(0);
      },
    },
  );

  console.log("");

  return response.groupId as string;
}

function stateColor(state: string): string {
  switch (state) {
    case "Stable":
      return chalk.green(`(${state})`);
    case "Empty":
      return chalk.gray(`(${state})`);
    case "PreparingRebalance":
    case "CompletingRebalance":
      return chalk.yellow(`(${state})`);
    case "Dead":
      return chalk.red(`(${state})`);
    default:
      return chalk.gray(`(${state})`);
  }
}
