import chalk from "chalk";
import type { SaslMechanism, SaslOptions, SslOptions } from "../types/index.js";

interface RawAuthOptions {
  ssl?: boolean;
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
  saslMechanism?: SaslMechanism;
  saslUsername?: string;
  saslPassword?: string; // direct CLI arg — not recommended
}

export interface BuiltAuthOptions {
  ssl?: SslOptions;
  sasl?: SaslOptions;
}

/**
 * Assembles SSL/SASL options from CLI arguments and environment variables.
 *
 * Password resolution order: KLAG_SASL_PASSWORD env var > --sasl-password CLI arg
 */
export function buildAuthOptions(raw: RawAuthOptions): BuiltAuthOptions {
  const result: BuiltAuthOptions = {};

  // ── SSL ───────────────────────────────────────────────────────
  if (raw.ssl || raw.sslCa || raw.sslCert || raw.sslKey) {
    result.ssl = {
      enabled: true,
      ...(raw.sslCa && { caPath: raw.sslCa }),
      ...(raw.sslCert && { certPath: raw.sslCert }),
      ...(raw.sslKey && { keyPath: raw.sslKey }),
    };
  }

  // ── SASL ──────────────────────────────────────────────────────
  if (raw.saslMechanism) {
    if (!raw.saslUsername) {
      throw new Error(
        "--sasl-username is required when --sasl-mechanism is specified.",
      );
    }

    const password = resolvePassword(raw.saslPassword);

    result.sasl = {
      mechanism: raw.saslMechanism,
      username: raw.saslUsername,
      password,
    };
  }

  return result;
}

function resolvePassword(cliPassword?: string): string {
  const envPassword = process.env.KLAG_SASL_PASSWORD;

  if (envPassword) {
    return envPassword;
  }

  if (cliPassword) {
    console.error(
      chalk.yellow(
        "\n⚠  Warning: --sasl-password passed via CLI argument.\n" +
          "   This may be visible in process listings (ps aux).\n" +
          "   Consider using the KLAG_SASL_PASSWORD environment variable instead.\n",
      ),
    );
    return cliPassword;
  }

  throw new Error(
    "SASL password is required.\n" +
      "   Set the KLAG_SASL_PASSWORD environment variable or use --sasl-password.",
  );
}
