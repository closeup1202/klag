import chalk from 'chalk'
import Table from 'cli-table3'
import type { HorizontalAlignment } from 'cli-table3'
import type { LagSnapshot, RcaResult, RateSnapshot } from '../types/index.js'
import { classifyLag } from '../types/index.js'

const LEVEL_ICON: Record<string, string> = {
  OK:   chalk.green('🟢 OK  '),
  WARN: chalk.yellow('🟡 WARN'),
  HIGH: chalk.red('🔴 HIGH'),
}

function formatLag(lag: bigint): string {
  return lag.toLocaleString()
}

function formatRate(rate: number): string {
  return rate < 0.1 ? '0' : `${rate.toFixed(1)} msg/s`
}

function groupStatus(totalLag: bigint): string {
  const level = classifyLag(totalLag)
  if (level === 'OK')   return chalk.green('✅ OK')
  if (level === 'WARN') return chalk.yellow('⚠️  WARNING')
  return chalk.red('🚨 CRITICAL')
}

export function printLagTable(
  snapshot: LagSnapshot,
  rcaResults: RcaResult[] = [],
  rateSnapshot?: RateSnapshot,
  watchMode = false
): void {
  const { groupId, broker, collectedAt, partitions, totalLag } = snapshot
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const localTime = collectedAt.toLocaleString('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace('T', ' ')

  // ── 헤더 ──────────────────────────────────────────────────────
  if (!watchMode) {
    console.log('')
    console.log(chalk.bold.cyan('⚡ kafka-why') + chalk.gray('  v0.1.0'))
    console.log('')
  }
  console.log(chalk.bold('🔍 Consumer Group: ') + chalk.white(groupId))
  console.log(chalk.bold('   Broker:         ') + chalk.white(broker))
  console.log(chalk.bold('   Collected At:   ') + chalk.gray(`${localTime} (${tz})`))
  console.log('')

  // ── Group 상태 요약 ────────────────────────────────────────────
  const status = groupStatus(totalLag)
  const totalStr = chalk.bold(formatLag(totalLag))
  console.log(`   Group Status : ${status}   Total Lag : ${totalStr}`)
  console.log('')

  // ── 파티션별 테이블 ────────────────────────────────────────────
  // rateSnapshot이 있으면 rate 컬럼 추가
  const hasRate = !!rateSnapshot && rateSnapshot.partitions.length > 0

  // rate를 빠르게 찾기 위한 Map 구성
  const rateMap = new Map<string, { produceRate: number; consumeRate: number }>()
  if (hasRate) {
    for (const r of rateSnapshot!.partitions) {
      rateMap.set(`${r.topic}-${r.partition}`, r)
    }
  }

  const head = [
    chalk.bold('Topic'),
    chalk.bold('Partition'),
    chalk.bold('Committed Offset'),
    chalk.bold('Log-End Offset'),
    chalk.bold('Lag'),
    chalk.bold('Status'),
    ...(hasRate
      ? [chalk.bold('Produce Rate'), chalk.bold('Consume Rate')]
      : []),
  ]

  const table = new Table({
    head,
    colAligns: [
      'left', 'right', 'right', 'right', 'right', 'center',
      ...(hasRate ? ['right', 'right'] : []),
    ] as HorizontalAlignment[],
    style: { head: [], border: ['grey'] },
  })

  for (const p of partitions) {
    const level = classifyLag(p.lag)
    const lagStr = level === 'HIGH'
      ? chalk.red(formatLag(p.lag))
      : level === 'WARN'
        ? chalk.yellow(formatLag(p.lag))
        : chalk.green(formatLag(p.lag))

    const rateEntry = rateMap.get(`${p.topic}-${p.partition}`)
    const rateColumns = hasRate
      ? [
          chalk.yellow(formatRate(rateEntry?.produceRate ?? 0)),
          chalk.cyan(formatRate(rateEntry?.consumeRate ?? 0)),
        ]
      : []

    table.push([
      p.topic,
      String(p.partition),
      formatLag(p.committedOffset),
      formatLag(p.logEndOffset),
      lagStr,
      LEVEL_ICON[level],
      ...rateColumns,
    ])
  }

  console.log(table.toString())
  console.log('')

  // ── RCA 섹션 ──────────────────────────────────────────────────
  if (rcaResults.length === 0) return

  console.log(chalk.bold('🔎 Root Cause Analysis'))
  console.log('')

  for (const rca of rcaResults) {
    const typeLabel = chalk.bold.yellow(`   [${rca.type}]`) + ' ' + chalk.white(rca.topic)
    console.log(typeLabel)
    console.log(chalk.gray(`   → ${rca.description}`))
    console.log(chalk.cyan(`   → 제안: ${rca.suggestion}`))
    console.log('')
  }
}