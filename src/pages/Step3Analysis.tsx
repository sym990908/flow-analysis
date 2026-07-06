import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useApp } from '../store/AppContext'
import { AnalysisScopeSelector, useScopedAnalysis } from '../components/AnalysisScopeSelector'
import { ScenarioReportView } from '../components/ScenarioReportView'
import { ExportPanel } from '../components/ExportPanel'
import { ReportHistoryPanel } from '../components/ReportHistoryPanel'
import { prepareTransactionsForReport } from '../lib/buildScenarioReport'
import { getScopedTransactions } from '../lib/analysisScope'
import { SCENARIO_DESCRIPTIONS, SCENARIO_LABELS, type ScenarioType } from '../types'

const SCENARIOS: ScenarioType[] = ['marriage', 'lending', 'labor', 'partnership', 'general']

export function Step3Analysis() {
  const { state, dispatch } = useApp()
  const { scopedTransactions, summary, isScopeValid } = useScopedAnalysis()

  const processedForReport = useMemo(
    () => prepareTransactionsForReport(state, scopedTransactions),
    [scopedTransactions, state.riskRules, state.scenario],
  )

  const activeReport = state.report
  const reportJobRunning = state.reportJob?.status === 'running'

  const startBackgroundReport = () => {
    if (!isScopeValid || processedForReport.length === 0) return
    if (reportJobRunning) return

    dispatch({
      type: 'START_REPORT_JOB',
      job: {
        id: uuidv4(),
        scenario: state.scenario,
        status: 'running',
        scopeSnapshot: {
          mode: state.analysisScope.mode,
          selectedFileIds: [...state.analysisScope.selectedFileIds],
          fileLabels: summary.labels,
          txCount: processedForReport.length,
        },
        startedAt: new Date().toISOString(),
      },
    })
  }

  const transactionsForActiveReport = useMemo(() => {
    if (!activeReport?.scopeSnapshot) return processedForReport
    const scope = {
      mode: activeReport.scopeSnapshot.mode,
      selectedFileIds: activeReport.scopeSnapshot.selectedFileIds,
    }
    const txs = getScopedTransactions(state.transactions, scope, state.files)
    return prepareTransactionsForReport(
      { ...state, scenario: activeReport.scenario, analysisScope: scope },
      txs,
    )
  }, [activeReport, processedForReport, state.transactions, state.riskRules, state.subjects, state.scenario])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">场景化智能分析报告</h2>
        <p className="mt-2 text-slate-600">
          同一项目可按不同流水组合、不同场景生成多份报告；生成过程在后台进行，可切换步骤继续操作
        </p>
      </div>

      <ReportHistoryPanel />

      <AnalysisScopeSelector compact />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            onClick={() => dispatch({ type: 'SET_SCENARIO', scenario: s })}
            className={`rounded-xl border p-4 text-left transition-all ${
              state.scenario === s
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <h3 className="font-semibold text-slate-900">{SCENARIO_LABELS[s]}</h3>
            <p className="mt-1 text-xs text-slate-500">{SCENARIO_DESCRIPTIONS[s]}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={startBackgroundReport}
          disabled={reportJobRunning || !isScopeValid || processedForReport.length === 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {reportJobRunning && <Loader2 size={16} className="animate-spin" />}
          {reportJobRunning
            ? '后台生成中…'
            : `生成${SCENARIO_LABELS[state.scenario]}报告（${summary.txCount} 笔 · ${summary.fileCount} 文件）`}
        </button>
        <p className="text-xs text-slate-500">
          点击后可在顶部切换步骤；完成后顶部横幅提示，报告自动保存到「已生成报告」列表
        </p>
        {!isScopeValid && (
          <p className="text-xs text-red-600">请在上方至少选择一个文件</p>
        )}
      </div>

      {activeReport && (
        <>
          {activeReport.analyzedFileNames && activeReport.analyzedFileNames.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              当前查看：{activeReport.analyzedFileNames.join('、')} ·{' '}
              {SCENARIO_LABELS[activeReport.scenario]}
            </div>
          )}
          <ScenarioReportView report={activeReport} />
          <ExportPanel report={activeReport} transactions={transactionsForActiveReport} />
        </>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
          className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm hover:bg-slate-50"
        >
          上一步
        </button>
        <button
          onClick={() => {
            if (confirm('新建项目？当前进度已自动保存。')) {
              dispatch({ type: 'RESET' })
            }
          }}
          className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          新建项目
        </button>
      </div>
    </div>
  )
}
