import { v4 as uuidv4 } from 'uuid'
import { analyzeScenario } from './api'
import { detectRisks, tagByScenario } from './riskEngine'
import { getScopeSummary } from './analysisScope'
import type { AppState, ReportJob, ScenarioReportRecord, Transaction } from '../types'
import { SCENARIO_LABELS } from '../types'

export function prepareTransactionsForReport(
  state: AppState,
  transactions: Transaction[],
): Transaction[] {
  const enabledRules = state.riskRules.filter((r) => r.enabled).map((r) => r.id)
  let txs = detectRisks(transactions, enabledRules)
  txs = tagByScenario(txs, state.scenario)
  return txs
}

export async function buildScenarioReportRecord(
  state: AppState,
  processedForReport: Transaction[],
  job?: ReportJob,
): Promise<ScenarioReportRecord> {
  const scenario = job?.scenario ?? state.scenario
  const scope = job?.scopeSnapshot
    ? {
        mode: job.scopeSnapshot.mode,
        selectedFileIds: job.scopeSnapshot.selectedFileIds,
      }
    : state.analysisScope

  const summary = getScopeSummary(scope, state.files, state.transactions)
  const result = await analyzeScenario(
    processedForReport,
    scenario,
    state.subjects.map((s) => ({ name: s.name, accounts: s.accounts })),
  )

  const keyTxs = processedForReport
    .filter((t) => result.keyTransactionIds?.includes(t.id) || t.isRisk)
    .slice(0, 20)

  const scopeTitle =
    summary.fileCount === 1
      ? summary.labels[0] ?? '单文件'
      : `${summary.fileCount} 个文件合并`

  return {
    id: uuidv4(),
    scenario,
    title: result.title,
    summary: `${result.summary}\n\n分析范围：${scopeTitle}（共 ${processedForReport.length} 笔）`,
    keyFindings: result.keyFindings,
    keyTransactions: keyTxs,
    riskAlerts: result.riskAlerts,
    timeline: result.timeline,
    recommendations: result.recommendations,
    generatedAt: new Date().toISOString(),
    analyzedFileNames: summary.labels,
    scopeSnapshot: {
      mode: scope.mode,
      selectedFileIds: [...scope.selectedFileIds],
      fileLabels: summary.labels,
      txCount: processedForReport.length,
    },
  }
}

export function reportJobLabel(job: ReportJob): string {
  return `${SCENARIO_LABELS[job.scenario]} · ${job.scopeSnapshot.fileLabels.join('、') || '未命名范围'}`
}
