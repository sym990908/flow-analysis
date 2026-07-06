import { useApp } from '../store/AppContext'
import type { FilterCriteria } from '../types'

export function FilterPanel() {
  const { state, dispatch } = useApp()
  const f = state.filters

  const update = (patch: Partial<FilterCriteria>) => {
    dispatch({ type: 'SET_FILTERS', filters: { ...f, ...patch } })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">筛选条件</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-slate-500">起始日期</span>
          <input
            type="date"
            value={f.dateFrom?.slice(0, 10) || ''}
            onChange={(e) => update({ dateFrom: e.target.value ? e.target.value + 'T00:00:00' : undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">结束日期</span>
          <input
            type="date"
            value={f.dateTo?.slice(0, 10) || ''}
            onChange={(e) => update({ dateTo: e.target.value ? e.target.value + 'T23:59:59' : undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">最小金额</span>
          <input
            type="number"
            value={f.minAmount ?? ''}
            onChange={(e) => update({ minAmount: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="0"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">最大金额</span>
          <input
            type="number"
            value={f.maxAmount ?? ''}
            onChange={(e) => update({ maxAmount: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">对方户名</span>
          <input
            type="text"
            value={f.counterparty || ''}
            onChange={(e) => update({ counterparty: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="关键词"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">摘要关键词</span>
          <input
            type="text"
            value={f.keyword || ''}
            onChange={(e) => update({ keyword: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="借款、工资..."
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-500">方向</span>
          <select
            value={f.direction || 'all'}
            onChange={(e) => update({ direction: e.target.value as FilterCriteria['direction'] })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">全部</option>
            <option value="in">收入</option>
            <option value="out">支出</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={f.riskOnly || false}
            onChange={(e) => update({ riskOnly: e.target.checked || undefined })}
            className="rounded"
          />
          <span className="text-sm text-slate-700">仅风险交易</span>
        </label>
      </div>
      <button
        onClick={() => dispatch({ type: 'SET_FILTERS', filters: {} })}
        className="mt-3 text-xs text-blue-600 hover:underline"
      >
        清除筛选
      </button>
    </div>
  )
}
