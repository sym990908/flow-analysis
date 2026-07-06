import { format } from 'date-fns'
import { FileText } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { SCENARIO_LABELS } from '../types'

export function ReportHistoryPanel() {
  const { state, dispatch } = useApp()

  if (state.reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        暂无已生成的场景报告。选择场景与分析范围后，可生成多份报告并在此查看历史记录。
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <FileText size={16} className="text-violet-600" />
        已生成报告 ({state.reports.length})
      </h3>
      <ul className="space-y-2">
        {state.reports.map((r) => {
          const active = r.id === state.activeReportId
          return (
            <li
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                active
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-slate-200 bg-slate-50 hover:border-violet-300'
              }`}
            >
              <button
                type="button"
                onClick={() => dispatch({ type: 'SELECT_REPORT', reportId: r.id })}
                className="min-w-0 flex-1 text-left"
              >
                <div className="font-medium text-slate-900">{r.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {SCENARIO_LABELS[r.scenario]} · {r.scopeSnapshot.fileLabels.join('、') || '—'} ·{' '}
                  {r.scopeSnapshot.txCount} 笔 ·{' '}
                  {format(new Date(r.generatedAt), 'yyyy-MM-dd HH:mm')}
                </div>
              </button>
              {active && (
                <span className="rounded bg-violet-600 px-2 py-0.5 text-xs text-white">当前查看</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
