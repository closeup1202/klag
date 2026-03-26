process.removeAllListeners('warning')

import { Command } from 'commander'
import chalk from 'chalk'
import { collectLag } from '../collector/lagCollector.js'
import { printLagTable } from '../reporter/tableReporter.js'
import { analyze } from '../analyzer/index.js'

const program = new Command()

program
  .name('kafka-why')
  .description('Kafka consumer lag root cause analyzer')
  .version('0.1.0')
  .requiredOption('-b, --broker <host:port>', 'Kafka broker address', 'localhost:9092')
  .requiredOption('-g, --group <groupId>', 'Consumer group ID')
  .option('--json', 'Output raw JSON instead of table')
  .action(async (options) => {
    try {
      process.stdout.write(chalk.gray('  Connecting to broker...'))

      const snapshot = await collectLag({
        broker: options.broker,
        groupId: options.group,
      })

      // 로딩 메시지 지우기
      process.stdout.write('\r' + ' '.repeat(40) + '\r')

      // ── 분석 실행 ──────────────────────────────────────────────
      const rcaResults = analyze(snapshot)

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
          rca: rcaResults,  // RCA 결과도 JSON에 포함
        }
        console.log(JSON.stringify(serializable, null, 2))
      } else {
        printLagTable(snapshot, rcaResults)  // rcaResults 전달
      }

      process.exit(0)
    } catch (err) {
      process.stdout.write('\r' + ' '.repeat(40) + '\r')
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`\n❌ Error: ${message}\n`))

      if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
        console.error(chalk.yellow('💡 Broker에 연결할 수 없어요. 아래를 확인해보세요:'))
        console.error(chalk.gray(`   • Kafka가 실행 중인지 확인: docker ps`))
        console.error(chalk.gray(`   • Broker 주소 확인: --broker ${options.broker}`))
        console.error('')
      }

      process.exit(1)
    }
  })

program.parse()