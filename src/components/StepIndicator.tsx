import { Check } from 'lucide-react'
import type { StepAccess, StepStats } from '../lib/stepNavigation'

const STEPS = [
  { num: 1 as const, label: '导入流水', desc: '拖入文件识别', statKey: 'fileCount' as const, unit: '文件' },
  { num: 2 as const, label: '结构化分析', desc: '去重与风险标记', statKey: 'transactionCount' as const, unit: '笔' },
  { num: 3 as const, label: '场景报告', desc: '智能分析与导出', statKey: 'reportCount' as const, unit: '份' },
]

interface Props {
  current: 1 | 2 | 3
  access: StepAccess
  stats: StepStats
  onStepClick: (step: 1 | 2 | 3) => void
  blockedHint?: string | null
}

export function StepIndicator({ current, access, stats, onStepClick, blockedHint }: Props) {
  const accessMap: Record<1 | 2 | 3, boolean> = {
    1: access.step1,
    2: access.step2,
    3: access.step3,
  }

  const statMap = {
    fileCount: stats.fileCount,
    transactionCount: stats.transactionCount,
    reportCount: stats.reportCount,
  }

  return (
    <div className="px-4 pb-4">
      {blockedHint && (
        <p className="mx-auto mb-2 max-w-xl text-center text-xs text-amber-700">{blockedHint}</p>
      )}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, i) => {
          const enabled = accessMap[step.num]
          const count = statMap[step.statKey]
          const isCurrent = current === step.num
          const isDone = current > step.num

          return (
            <div key={step.num} className="flex items-center">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onStepClick(step.num)}
                title={
                  enabled
                    ? `进入：${step.label}${count > 0 ? `（已记录 ${count} ${step.unit}）` : ''}`
                    : '请先完成上一步'
                }
                className={`group flex flex-col items-center rounded-xl px-2 py-1 transition-colors ${
                  enabled ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ring-offset-2 ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                      : isDone
                        ? 'bg-green-500 text-white group-hover:ring-2 group-hover:ring-green-300'
                        : enabled
                          ? 'bg-slate-200 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700'
                          : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {isDone ? <Check size={18} /> : step.num}
                </div>
                <span className="mt-1.5 text-xs font-medium text-slate-700">{step.label}</span>
                <span className="text-[10px] text-slate-400">{step.desc}</span>
                {count > 0 && (
                  <span className="mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    已记录 {count} {step.unit}
                  </span>
                )}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 w-12 sm:w-20 ${current > step.num ? 'bg-green-400' : 'bg-slate-200'}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
