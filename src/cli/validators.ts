import { InvalidArgumentError } from "commander";

export function parseInterval(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError("--interval must be a number >= 1000ms.");
  }
  return parsed;
}

export function parseBroker(value: string): string {
  const pattern = /^[^:]+:\d+$/;
  if (!pattern.test(value)) {
    throw new InvalidArgumentError(
      "--broker format is invalid. Example: localhost:9092",
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
