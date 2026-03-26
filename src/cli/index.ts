process.removeAllListeners('warning')

import { Command, InvalidArgumentError } from 'commander'
import chalk from 'chalk'
import { collectLag } from '../collector/lagCollector.js'
import { collectRate } from '../collector/rateCollector.js'
import { printLagTable } from '../reporter/tableReporter.js'
import { analyze } from '../analyzer/index.js'
import { startWatch } from './watcher.js'

// ── 커스텀 파서 ───────────────────────────────────────────────────
function parseInterval(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1000) {
    throw new InvalidArgumentError('--interval 은 1000ms 이상의 숫자여야 해요.')
  }
  return parsed
}

function parseBroker(value: string): string {
  const pattern = /^.+:\d+$/
  if (!pattern.test(value)) {
    throw new InvalidArgumentError('--broker 형식이 올바르지 않아요. 예: localhost:9092')
  }
  return value
}

const program = new Command()

program
  .name('kafka-why')
  .description('Kafka consumer lag root cause analyzer')
  .version('0.1.0')
  .requiredOption('-b, --broker <host:port>', 'Kafka broker address', parseBroker, 'localhost:9092')
  .requiredOption('-g, --group <groupId>', 'Consumer group ID')
  .option('-i, --interval <ms>', 'Rate sampling interval in ms', parseInterval, 5000)
  .option('-w, --watch', 'Watch mode — refresh every interval')
  .option('--no-rate', 'Skip rate sampling (faster, no PRODUCER_BURST detection)')
  .option('--json', 'Output raw JSON instead of table')
  .action(async (options) => {
    try {
      const kafkaOptions = {
        broker: options.broker,
        groupId: options.group,
        intervalMs: options.interval,
      }

      // ── watch 모드 ─────────────────────────────────────────────
      if (options.watch) {
        await startWatch(kafkaOptions, options.rate === false)
        return
      }

      // ── 일반 모드 ──────────────────────────────────────────────
      process.stdout.write(chalk.gray('  Connecting to broker...'))

      const snapshot = await collectLag(kafkaOptions)

      process.stdout.write('\r' + ' '.repeat(50) + '\r')

      let rateSnapshot = undefined
      if (options.rate !== false) {
        rateSnapshot = await collectRate(kafkaOptions)
      }

      process.stdout.write('\r' + ' '.repeat(50) + '\r')

      const rcaResults = analyze(snapshot, rateSnapshot)

      if (options.json) {
        const serializable = {
          ...snapshot,
          totalLag: snapshot.totalLag.toString(),
          partitions: snapshot.partitions.map((p) => ({
            ...p,
            lag: p.lag.toString(),
            logEndOffset: p.logEndOffset.toString(),
            committedOffset: p.committedOffset.toString(),
          })),
          rate: rateSnapshot,
          rca: rcaResults,
        }
        console.log(JSON.stringify(serializable, null, 2))
      } else {
        printLagTable(snapshot, rcaResults, rateSnapshot)
      }

      process.exit(0)
     } catch (err) {
      process.stdout.write('\r' + ' '.repeat(50) + '\r')
      const message = err instanceof Error ? err.message : String(err)

      if (
        message.includes('ECONNREFUSED') ||
        message.includes('ETIMEDOUT') ||
        message.includes('Connection error') ||
        message.includes('connect ECONNREFUSED')
      ) {
        console.error(chalk.red(`\n❌ Broker에 연결할 수 없어요\n`))
        console.error(chalk.yellow('   확인해보세요:'))
        console.error(chalk.gray(`   • Kafka 실행 여부: docker ps`))
        console.error(chalk.gray(`   • Broker 주소: ${options.broker}`))
        console.error(chalk.gray(`   • 포트 접근 가능 여부: nc -zv ${options.broker.split(':')[0]} ${options.broker.split(':')[1]}`))
        console.error('')
        process.exit(1)
      }

      // group 없음
      if (message.includes('not found') || message.includes('Dead state')) {
        console.error(chalk.red(`\n❌ Consumer group을 찾을 수 없어요\n`))
        console.error(chalk.yellow('   확인해보세요:'))
        console.error(chalk.gray(`   • Group ID: ${options.group}`))
        console.error(chalk.gray(`   • 존재하는 group 목록 확인:`))
        console.error(chalk.gray(`     kafka-consumer-groups.sh --bootstrap-server ${options.broker} --list`))
        console.error('')
        process.exit(1)
      }

      console.error(chalk.red(`\n❌ Error: ${message}\n`))
      process.exit(1)
    }
  })

program.parse()