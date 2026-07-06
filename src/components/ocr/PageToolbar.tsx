import { RotateCw, ChevronLeft, ChevronRight, Scan, RefreshCw, RotateCcw } from 'lucide-react'
import type { OcrRotation } from '../../types/ocr'

interface Props {
  currentPage: number
  totalPages: number
  rotation: OcrRotation
  pageRange: string
  isRunning: boolean
  onRotatePage: () => void
  onRotateAll: () => void
  onPrev: () => void
  onNext: () => void
  onJump: (page: number) => void
  onPageRangeChange: (range: string) => void
  onStartOcr: () => void
  onRetryPage: () => void
}

export function PageToolbar({
  currentPage,
  totalPages,
  rotation,
  pageRange,
  isRunning,
  onRotatePage,
  onRotateAll,
  onPrev,
  onNext,
  onJump,
  onPageRangeChange,
  onStartOcr,
  onRetryPage,
}: Props) {
  const btn =
    'flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <button
        onClick={onRotatePage}
        disabled={isRunning}
        className={btn}
        title="顺时针旋转当前页 90°"
      >
        <RotateCw size={16} /> 当前页 {rotation}°
      </button>
      <button
        onClick={onRotateAll}
        disabled={isRunning}
        className={btn}
        title="顺时针旋转整个文件所有页 90°"
      >
        <RotateCcw size={16} /> 全部页旋转
      </button>

      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={currentPage <= 0 || isRunning} className="rounded p-1 hover:bg-slate-100 disabled:opacity-50">
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-1 text-sm">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage + 1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n)) onJump(n - 1)
            }}
            className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center"
          />
          <span className="text-slate-500">/ {totalPages}</span>
        </div>
        <button onClick={onNext} disabled={currentPage >= totalPages - 1 || isRunning} className="rounded p-1 hover:bg-slate-100 disabled:opacity-50">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <label className="text-xs text-slate-500">页范围</label>
        <input
          value={pageRange}
          onChange={(e) => onPageRangeChange(e.target.value)}
          placeholder="1-5,8"
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
          disabled={isRunning}
        />
      </div>

      <button
        onClick={onStartOcr}
        disabled={isRunning}
        className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Scan size={16} /> {isRunning ? '识别中...' : '开始识别'}
      </button>

      <button
        onClick={onRetryPage}
        disabled={isRunning}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw size={14} /> 重识别当前页
      </button>
    </div>
  )
}
