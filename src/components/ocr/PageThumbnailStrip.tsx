import type { OcrPageStatus } from '../../types/ocr'

interface Props {
  totalPages: number
  currentPage: number
  pageStatuses: OcrPageStatus[]
  thumbnails: Map<number, string>
  onSelectPage: (pageIndex: number) => void
}

const STATUS_COLORS: Record<OcrPageStatus, string> = {
  idle: 'bg-slate-300',
  running: 'bg-blue-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
  skipped: 'bg-slate-200',
}

export function PageThumbnailStrip({
  totalPages,
  currentPage,
  pageStatuses,
  thumbnails,
  onSelectPage,
}: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelectPage(i)}
          className={`relative shrink-0 overflow-hidden rounded border-2 transition-all ${
            currentPage === i ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          {thumbnails.has(i) ? (
            <img src={thumbnails.get(i)} alt={`第${i + 1}页`} className="h-16 w-auto" />
          ) : (
            <div className="flex h-16 w-12 items-center justify-center bg-slate-100 text-xs text-slate-400">
              {i + 1}
            </div>
          )}
          <span
            className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full ${STATUS_COLORS[pageStatuses[i] || 'idle']}`}
          />
        </button>
      ))}
    </div>
  )
}
