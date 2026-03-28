import { InvalidArgumentError } from "commander";

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
