import { CONFIDENCE_LEGEND } from '../../lib/confidenceStyle'

export function ConfidenceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="font-medium">置信度：</span>
      {CONFIDENCE_LEGEND.map((item) => (
        <span key={item.level} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm border"
            style={{ borderColor: item.color, backgroundColor: `${item.color}22` }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
