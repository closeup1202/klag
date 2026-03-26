import chalk from 'chalk'
import Table from 'cli-table3'
import type { LagSnapshot, RcaResult } from '../types/index.js'
import { classifyLag } from '../types/index.js'

const LEVEL_ICON: Record<string, string> = {
  OK:   chalk.green('🟢 OK  '),
  WARN: chalk.yellow('🟡 WARN'),
  HIGH: chalk.red('🔴 HIGH'),
}

function formatLag(lag: bigint): string {
  return lag.toLocaleString()
}

function groupStatus(totalLag: bigint): string {
  const level = classifyLag(totalLag)
  if (level === 'OK')   return chalk.green('✅ OK')
  if (level === 'WARN') return chalk.yellow('⚠️  WARNING')
  return chalk.red('🚨 CRITICAL')
}

export function printLagTable(snapshot: LagSnapshot, rcaResults: RcaResult[] = []): void {
  const { groupId, broker, collectedAt, partitions, totalLag } = snapshot

  // ── 헤더 ──────────────────────────────────────────────────────
  console.log('')
  console.log(chalk.bold.cyan('⚡ kafka-why') + chalk.gray('  v0.1.0'))
  console.log('')
  console.log(chalk.bold('🔍 Consumer Group: ') + chalk.white(groupId))
  console.log(chalk.bold('   Broker:         ') + chalk.white(broker))
  console.log(chalk.bold('   Collected At:   ') + chalk.gray(collectedAt.toISOString()))
  console.log('')

  // ── Group 상태 요약 ────────────────────────────────────────────
  const status = groupStatus(totalLag)
  const totalStr = chalk.bold(formatLag(totalLag))
  console.log(`   Group Status : ${status}   Total Lag : ${totalStr}`)
  console.log('')

  // ── 파티션별 테이블 ────────────────────────────────────────────
  const table = new Table({
    head: [
      chalk.bold('Topic'),
      chalk.bold('Partition'),
      chalk.bold('Committed Offset'),
      chalk.bold('Log-End Offset'),
      chalk.bold('Lag'),
      chalk.bold('Status'),
    ],
    colAligns: ['left', 'right', 'right', 'right', 'right', 'center'],
    style: { head: [], border: ['grey'] },
  })

  for (const p of partitions) {
    const level = classifyLag(p.lag)
    const lagStr = level === 'HIGH'
      ? chalk.red(formatLag(p.lag))
      : level === 'WARN'
        ? chalk.yellow(formatLag(p.lag))
        : chalk.green(formatLag(p.lag))

    table.push([
      p.topic,
      String(p.partition),
      formatLag(p.committedOffset),
      formatLag(p.logEndOffset),
      lagStr,
      LEVEL_ICON[level],
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