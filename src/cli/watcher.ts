import chalk from 'chalk'
import { collectLag } from '../collector/lagCollector.js'
import { collectRate } from '../collector/rateCollector.js'
import { analyze } from '../analyzer/index.js'
import { printLagTable } from '../reporter/tableReporter.js'
import type { KafkaOptions } from '../types/index.js'

function clearScreen(): void {
  process.stdout.write('\x1Bc')
}

function printWatchHeader(intervalMs: number, updatedAt: Date): void {
  const intervalSec = intervalMs / 1000
  const timeStr = updatedAt.toLocaleTimeString('ko-KR')

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
  console.log(chalk.gray(`   Last updated: ${timeStr}`))
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

  // 최초 1회 실행
  process.stdout.write(chalk.gray('  Connecting to broker...'))
  await runOnce(options, noRate)

  // 루프
  while (true) {
    await printCountdown(waitSec)
    await runOnce(options, noRate)
  }
}
/* 
핵심 흐름:

startWatch() 호출
    │
    ├── runOnce()       → lag + rate 수집 → 화면 갱신
    ├── printCountdown() → "다음 갱신까지 N초..." 카운트다운
    ├── runOnce()       → 다시 수집 → 화면 갱신
    └── 무한 반복 (Ctrl+C까지) 
*/