import { useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { applyFilters } from '../lib/api'
import { detectRisks, tagByScenario } from '../lib/riskEngine'
import { AnalysisScopeSelector, useScopedAnalysis } from '../components/AnalysisScopeSelector'
import { goProjectHome } from '../lib/navigation'
import { FilterPanel } from '../components/FilterPanel'
import { TransactionTable } from '../components/TransactionTable'
import { FundFlowChart } from '../components/FundFlowChart'
import { RiskRulesPanel } from '../components/RiskRulesPanel'
import { SubjectManager } from '../components/SubjectManager'
import { ExportPanel } from '../components/ExportPanel'

export function Step2Structure() {
  const { state, dispatch } = useApp()
  const { scopedTransactions, summary, isScopeValid, showFileColumn, fileNameById } =
    useScopedAnalysis()

  const processed = useMemo(() => {
    const enabledRules = state.riskRules.filter((r) => r.enabled).map((r) => r.id)
    let txs = detectRisks(scopedTransactions, enabledRules)
    txs = tagByScenario(txs, state.scenario)
    return txs
  }, [scopedTransactions, state.riskRules, state.scenario])

  const filtered = useMemo(
    () => applyFilters(processed, state.filters),
    [processed, state.filters],
  )

  const stats = useMemo(() => {
    const totalIn = filtered.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
    const totalOut = filtered.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)
    const riskCount = filtered.filter((t) => t.isRisk).length
    return { totalIn, totalOut, riskCount, count: filtered.length }
  }, [filtered])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">结构化分析与资金核查</h2>
        <p className="mt-2 text-slate-600">
          可选择单个或多个银行流水合并分析；OCR 校对仍按单文件进行
        </p>
      </div>

      <AnalysisScopeSelector compact />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '交易笔数', value: stats.count, color: 'text-slate-900' },
          { label: '总收入', value: `¥${stats.totalIn.toLocaleString()}`, color: 'text-green-600' },
          { label: '总支出', value: `¥${stats.totalOut.toLocaleString()}`, color: 'text-red-600' },
          { label: '风险交易', value: stats.riskCount, color: 'text-orange-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`mt-1 text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FilterPanel />
        </div>
        <RiskRulesPanel />
      </div>

      <SubjectManager />
      <FundFlowChart transactions={filtered} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            流水明细 ({filtered.length} 笔
            {summary.fileCount > 1 ? ` · ${summary.fileCount} 个文件` : ''})
          </h3>
        </div>
        <TransactionTable
          transactions={filtered}
          showFileColumn={showFileColumn}
          fileNameById={fileNameById}
        />
      </div>

      <ExportPanel transactions={filtered} />

      <div className="flex justify-between">
        <button
          onClick={() => goProjectHome(dispatch)}
          className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm hover:bg-slate-50"
        >
          返回项目首页
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}
          disabled={!isScopeValid || scopedTransactions.length === 0}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          下一步：场景分析报告 ({summary.txCount} 笔)
        </button>
      </div>
    </div>
  )
}
