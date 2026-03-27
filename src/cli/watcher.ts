import chalk from 'chalk'
import { collectLag } from '../collector/lagCollector.js'
import { collectRate } from '../collector/rateCollector.js'
import { analyze } from '../analyzer/index.js'
import { printLagTable } from '../reporter/tableReporter.js'
import type { KafkaOptions, LagSnapshot } from '../types/index.js'

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
    chalk.bold.cyan('⚡ klag') +
    chalk.gray('  v0.1.0') +
    '  │  ' +
    chalk.yellow('watch mode') +
    '  │  ' +
    chalk.gray(`${intervalSec}s refresh`) +
    '  │  ' +
    chalk.gray('Ctrl+C to exit')
  )
  console.log(chalk.gray(`   Last updated: ${timeStr} (${tz})`))
}

function printWatchError(message: string, retryCount: number, retryIn: number): void {
  clearScreen()
  console.log(
    chalk.bold.cyan('⚡ klag') +
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
    chalk.bold.cyan('⚡ klag') +
    chalk.gray('  v0.1.0') +
    '  │  ' +
    chalk.yellow('watch mode')
  )
  console.log('')
  console.error(chalk.red(`   ❌ Error: ${message}`))
  console.error(chalk.red(`   All ${MAX_RETRIES} retries failed — exiting watch mode`))
  console.log('')
}

// ── 이전 snapshot과 비교해서 lagDiff 계산 ─────────────────────────
function applyDiff(current: LagSnapshot, previous: LagSnapshot): LagSnapshot {
  const prevMap = new Map<string, bigint>()
  for (const p of previous.partitions) {
    prevMap.set(`${p.topic}-${p.partition}`, p.lag)
  }

  const partitions = current.partitions.map((p) => {
    const prevLag = prevMap.get(`${p.topic}-${p.partition}`)
    const lagDiff = prevLag !== undefined ? p.lag - prevLag : undefined
    return { ...p, lagDiff }
  })

  return { ...current, partitions }
}

async function runOnce(
  options: KafkaOptions,
  noRate: boolean,
  previous?: LagSnapshot
): Promise<LagSnapshot> {
  const snapshot = await collectLag(options)

  let rateSnapshot = undefined
  if (!noRate) {
    rateSnapshot = await collectRate(options)
  }

  const rcaResults = analyze(snapshot, rateSnapshot)

  // 이전 snapshot이 있으면 diff 계산
  const snapshotWithDiff = previous ? applyDiff(snapshot, previous) : snapshot

  clearScreen()
  printWatchHeader(options.intervalMs ?? 5000, snapshot.collectedAt)
  printLagTable(snapshotWithDiff, rcaResults, rateSnapshot, true)

  return snapshot  // 다음 루프를 위해 diff 없는 원본 반환
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
  process.on('SIGINT', () => {
    console.log(chalk.gray('\n\n  Watch mode exited\n'))
    process.exit(0)
  })

  const intervalMs = options.intervalMs ?? 5000
  const waitSec = Math.ceil(intervalMs / 1000)

  process.stdout.write(chalk.gray('  Connecting to broker...'))

  let errorCount = 0
  let previousSnapshot: LagSnapshot | undefined = undefined

  while (true) {
    try {
      // 이전 snapshot 전달 → diff 계산
      previousSnapshot = await runOnce(options, noRate, previousSnapshot)
      errorCount = 0
      await printCountdown(waitSec)
    } catch (err) {
      errorCount++
      const message = getFriendlyMessage(err, options.broker)

      if (errorCount >= MAX_RETRIES) {
        printWatchFatal(message)
        process.exit(1)
      }

      printWatchError(message, errorCount, waitSec)
      await printCountdown(waitSec)
    }
  }
}