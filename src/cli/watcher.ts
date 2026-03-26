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
    chalk.gray(`${intervalSec}초마다 갱신`) +
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
  console.log(chalk.yellow(`   재시도 ${retryCount}/${MAX_RETRIES}... ${retryIn}초 후`))
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
  console.error(chalk.red(`   재시도 ${MAX_RETRIES}/${MAX_RETRIES} 모두 실패 — watch mode 종료`))
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
        `\r${chalk.gray(`   [●] 다음 갱신까지 ${remaining}초...`)}   `
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
    return `Broker에 연결할 수 없어요 (${broker})`
  }

  if (message.includes('Dead state') || message.includes('not found')) {
    return `Consumer group을 찾을 수 없어요`
  }

  return message
}

export async function startWatch(
  options: KafkaOptions,
  noRate: boolean
): Promise<void> {
  // Ctrl+C 핸들러
  process.on('SIGINT', () => {
    console.log(chalk.gray('\n\n  watch mode 종료\n'))
    process.exit(0)
  })

  const intervalMs = options.intervalMs ?? 5000
  const waitSec = Math.ceil(intervalMs / 1000)

  process.stdout.write(chalk.gray('  Connecting to broker...'))

  let errorCount = 0

  // ── 루프 ──────────────────────────────────────────────────────
  while (true) {
    try {
      await runOnce(options, noRate)
      errorCount = 0  // 성공하면 에러 카운트 리셋
      await printCountdown(waitSec)
    } catch (err) {
      errorCount++
      const message = getFriendlyMessage(err, options.broker)

      // 최대 재시도 초과 → 종료
      if (errorCount >= MAX_RETRIES) {
        printWatchFatal(message)
        process.exit(1)
      }

      // 재시도
      printWatchError(message, errorCount, waitSec)
      await printCountdown(waitSec)
    }
  }
}
/*

흐름 정리:

성공        → errorCount 리셋 → 정상 루프 유지
1번 실패    → "재시도 1/3... N초 후" → 카운트다운 → 재시도
2번 실패    → "재시도 2/3... N초 후" → 카운트다운 → 재시도
3번 실패    → "재시도 3/3 모두 실패 — watch mode 종료" → exit(1)
중간에 성공 → errorCount 0으로 리셋 → 정상 루프 유지 
*/