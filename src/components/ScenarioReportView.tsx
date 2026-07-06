import { AlertTriangle, Clock, Lightbulb, Target } from 'lucide-react'
import type { ScenarioReport } from '../types'
import { SCENARIO_LABELS } from '../types'
import { TransactionTable } from './TransactionTable'

export function ScenarioReportView({ report }: { report: ScenarioReport }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{report.title}</h2>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            {SCENARIO_LABELS[report.scenario]}
          </span>
        </div>
        <p className="leading-relaxed text-slate-700">{report.summary}</p>
        <p className="mt-2 text-xs text-slate-400">
          生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Target size={16} className="text-blue-600" /> 关键发现
          </h3>
          <ul className="space-y-2">
            {report.keyFindings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                  {i + 1}
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <AlertTriangle size={16} className="text-red-600" /> 风险预警
          </h3>
          <ul className="space-y-2">
            {report.riskAlerts.length === 0 ? (
              <li className="text-sm text-slate-500">未发现明显风险</li>
            ) : (
              report.riskAlerts.map((a, i) => (
                <li key={i} className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{a}</li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Clock size={16} className="text-purple-600" /> 资金时间线
        </h3>
        <div className="relative ml-4 border-l-2 border-slate-200 pl-6">
          {report.timeline.map((item, i) => (
            <div key={i} className="relative mb-4 last:mb-0">
              <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />
              <p className="text-xs text-slate-400">{item.date}</p>
              <p className="text-sm text-slate-800">{item.event}</p>
              {item.amount !== undefined && (
                <p className="text-sm font-mono text-slate-600">¥{item.amount.toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Lightbulb size={16} className="text-amber-600" /> 分析建议
        </h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
          {report.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {report.keyTransactions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">重点交易清单</h3>
          <TransactionTable transactions={report.keyTransactions} compact />
        </div>
      )}
    </div>
  )
}
