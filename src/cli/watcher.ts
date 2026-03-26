import chalk from 'chalk'
import { collectLag } from '../collector/lagCollector.js'
import { collectRate } from '../collector/rateCollector.js'
import { analyze } from '../analyzer/index.js'
import { printLagTable } from '../reporter/tableReporter.js'
import type { KafkaOptions } from '../types/index.js'

const MAX_RETRIES = 3

function clearScreen(): void {
  process.stdout.write('\x1Bc')
}

function printWatchHeader(intervalMs: number, updatedAt: Date): void {
  const intervalSec = intervalMs / 1000
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timeStr = updatedAt.toLocaleString('sv-SE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  console.log(
    chalk.bold.cyan('⚡ kafka-why') +
    chalk.gray('  v0.1.0') +
    '  │  ' +
    chalk.yellow('watch mode') +
    '  │  ' +
    chalk.gray(`refresh every ${intervalSec}s`) +
    '  │  ' +
    chalk.gray('Ctrl+C to exit')
  )
  console.log(chalk.gray(`   Last updated: ${timeStr} (${tz})`))
}

function printWatchError(message: string, retryCount: number, retryIn: number): void {
  clearScreen()
  console.log(
    chalk.bold.cyan('⚡ kafka-why') +
    chalk.gray('  v0.1.0') +
    '  │  ' +
    chalk.yellow('watch mode') +
    '  │  ' +
    chalk.gray('Ctrl+C to exit')
  )
  console.log('')
  console.error(chalk.red(`   ❌ Error: ${message}`))
  console.log(chalk.yellow(`   Retrying ${retryCount}/${MAX_RETRIES}... in ${retryIn}s`))
  console.log('')
}

function printWatchFatal(message: string): void {
  clearScreen()
  console.log(
    chalk.bold.cyan('⚡ kafka-why') +
    chalk.gray('  v0.1.0') +
    '  │  ' +
    chalk.yellow('watch mode')
  )
  console.log('')
  console.error(chalk.red(`   ❌ Error: ${message}`))
  console.error(chalk.red(`   All ${MAX_RETRIES}/${MAX_RETRIES} retries failed — exiting watch mode`))
  console.log('')
}

async function runOnce(
  options: KafkaOptions,
  noRate: boolean
): Promise<void> {
  const snapshot = await collectLag(options)

  let rateSnapshot = undefined
  if (!noRate) {
    rateSnapshot = await collectRate(options)
  }

  const rcaResults = analyze(snapshot, rateSnapshot)

  clearScreen()
  printWatchHeader(options.intervalMs ?? 5000, snapshot.collectedAt)
  printLagTable(snapshot, rcaResults, rateSnapshot, true)
}

function printCountdown(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = seconds

    const tick = (): void => {
      process.stdout.write(
        `\r${chalk.gray(`   [●] Next refresh in ${remaining}s...`)}   `
      )
      if (remaining === 0) {
        process.stdout.write('\r' + ' '.repeat(40) + '\r')
        resolve()
        return
      }
      remaining--
      setTimeout(tick, 1000)
    }

    tick()
  })
}

function getFriendlyMessage(err: unknown, broker: string): string {
  const message = err instanceof Error ? err.message : String(err)

  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('Connection error')
  ) {
    return `Cannot connect to broker (${broker})`
  }

  if (message.includes('Dead state') || message.includes('not found')) {
    return `Consumer group not found`
  }

  return message
}

export async function startWatch(
  options: KafkaOptions,
  noRate: boolean
): Promise<void> {
  // SIGINT handler
  process.on('SIGINT', () => {
    console.log(chalk.gray('\n\n  watch mode stopped\n'))
    process.exit(0)
  })

  const intervalMs = options.intervalMs ?? 5000
  const waitSec = Math.ceil(intervalMs / 1000)

  process.stdout.write(chalk.gray('  Connecting to broker...'))

  let errorCount = 0

  // ── main loop ─────────────────────────────────────────────────
  while (true) {
    try {
      await runOnce(options, noRate)
      errorCount = 0  // reset error count on success
      await printCountdown(waitSec)
    } catch (err) {
      errorCount++
      const message = getFriendlyMessage(err, options.broker)

      // exceeded max retries → exit
      if (errorCount >= MAX_RETRIES) {
        printWatchFatal(message)
        process.exit(1)
      }

      // retry
      printWatchError(message, errorCount, waitSec)
      await printCountdown(waitSec)
    }
  }
}
/*

Flow summary:

success         → reset errorCount → continue normal loop
1st failure     → "Retrying 1/3... in Ns" → countdown → retry
2nd failure     → "Retrying 2/3... in Ns" → countdown → retry
3rd failure     → "All 3/3 retries failed — exiting watch mode" → exit(1)
success in between → reset errorCount to 0 → continue normal loop
*/
