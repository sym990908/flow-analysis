import type { OcrBatchProgress } from '../../lib/api'

interface Props {
  progress: OcrBatchProgress | null
}

export function OcrProgressBar({ progress }: Props) {
  if (!progress || progress.total === 0) return null

  const pct = Math.round((progress.completed / progress.total) * 100)

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
      <div className="mb-1 flex justify-between text-xs text-blue-700">
        <span>
          OCR 进度：{progress.completed}/{progress.total}
          {progress.failed > 0 && ` (${progress.failed} 失败)`}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
