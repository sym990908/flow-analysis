import { Loader2, AlertCircle, X } from 'lucide-react'
import { useApp } from '../store/AppContext'

export function ParseJobBanner() {
  const { state, dispatch } = useApp()
  const job = state.parseJob
  if (!job || job.status === 'done') return null

  const fileName = state.files.find((f) => f.id === job.fileId)?.name

  if (job.status === 'running') {
    return (
      <div className="border-b border-blue-200 bg-blue-50 px-4 py-2">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-blue-800">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <span>
            正在解析{fileName ? `「${fileName}」` : ''}流水…可继续其他操作
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-2">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 text-sm text-red-800">
        <span className="flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          解析失败：{job.error || '未知错误'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'SET_ACTIVE_OCR_FILE', fileId: job.fileId })
              dispatch({ type: 'SET_STEP1_PHASE', phase: 'workspace' })
              dispatch({ type: 'SET_STEP', step: 1 })
              dispatch({ type: 'CLEAR_PARSE_JOB' })
            }}
            className="rounded bg-red-700 px-3 py-1 text-xs text-white hover:bg-red-800"
          >
            返回工作台重试
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR_PARSE_JOB' })}
            className="rounded p-1 hover:bg-red-100"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
