import { Loader2, AlertCircle, X, FileText } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { reportJobLabel } from '../lib/buildScenarioReport'

export function ReportJobBanner() {
  const { state, dispatch } = useApp()
  const job = state.reportJob
  if (!job) return null

  if (job.status === 'running') {
    return (
      <div className="border-b border-violet-200 bg-violet-50 px-4 py-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 text-sm text-violet-900">
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin shrink-0" />
            正在后台生成场景报告：{reportJobLabel(job)}
            {job.progress != null && job.progress > 0 ? ` · ${job.progress}%` : ''} · 通常需 1–3 分钟
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR_STUCK_REPORT_JOB' })}
            className="shrink-0 rounded border border-violet-300 px-2 py-0.5 text-xs hover:bg-violet-100"
          >
            取消等待
          </button>
        </div>
      </div>
    )
  }

  if (job.status === 'done') {
    return (
      <div className="border-b border-green-200 bg-green-50 px-4 py-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 text-sm text-green-900">
          <span className="flex items-center gap-2">
            <FileText size={16} className="shrink-0" />
            场景报告已生成，已保存到项目记录
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (job.reportId) {
                  dispatch({ type: 'SELECT_REPORT', reportId: job.reportId })
                }
                dispatch({ type: 'SET_STEP', step: 3 })
                dispatch({ type: 'CLEAR_REPORT_JOB' })
              }}
              className="rounded bg-green-700 px-3 py-1 text-xs text-white hover:bg-green-800"
            >
              查看报告
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_REPORT_JOB' })}
              className="rounded p-1 hover:bg-green-100"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-2">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 text-sm text-red-800">
        <span className="flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          报告生成失败：{job.error || '未知错误'}
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR_REPORT_JOB' })}
          className="rounded p-1 hover:bg-red-100"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
