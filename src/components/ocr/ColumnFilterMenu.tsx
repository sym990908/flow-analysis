import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import type { ColumnFilterState } from '../../types/columnFilter'
import { createEmptyColumnFilter } from '../../types/columnFilter'

interface Props {
  columnIndex: number
  headerLabel: string
  values: string[]
  filter: ColumnFilterState
  onChange: (filter: ColumnFilterState) => void
}

function isNumericColumn(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim())
  if (nonEmpty.length === 0) return false
  let numeric = 0
  for (const v of nonEmpty) {
    const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
    if (!Number.isNaN(n)) numeric++
  }
  return numeric / nonEmpty.length >= 0.6
}

export function ColumnFilterMenu({
  columnIndex,
  headerLabel,
  values,
  filter,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const uniqueValues = useMemo(() => {
    const set = new Set<string>()
    for (const v of values) {
      const t = v.trim()
      set.add(t || '(空白)')
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [values])

  const numericMode = useMemo(() => isNumericColumn(values), [values])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const initFilter = (): ColumnFilterState => ({
    enabled: true,
    mode: numericMode ? 'number' : 'values',
    selectedValues: new Set(uniqueValues),
    min: undefined,
    max: undefined,
  })

  const activeFilter = filter.enabled ? filter : initFilter()

  const filteredList = uniqueValues.filter((v) =>
    v.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const toggleValue = (value: string) => {
    const next = new Set(activeFilter.selectedValues)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange({ ...activeFilter, enabled: true, mode: 'values', selectedValues: next })
  }

  const selectAll = () => {
    onChange({
      ...activeFilter,
      enabled: true,
      mode: 'values',
      selectedValues: new Set(uniqueValues),
    })
  }

  const clearAll = () => {
    onChange({
      ...activeFilter,
      enabled: true,
      mode: 'values',
      selectedValues: new Set(),
    })
  }

  const clearFilter = () => {
    onChange(createEmptyColumnFilter())
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded p-0.5 hover:bg-slate-200 ${
          filter.enabled ? 'text-blue-600' : 'text-slate-400'
        }`}
        title={`筛选列 ${headerLabel || columnIndex + 1}`}
      >
        <Filter size={12} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">筛选</span>
            <button type="button" onClick={clearFilter} className="text-xs text-slate-500 hover:text-red-600">
              清除
            </button>
          </div>

          {numericMode && (
            <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
              <p className="text-[10px] font-medium text-slate-500">数值范围</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="最小"
                  value={activeFilter.min ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...activeFilter,
                      enabled: true,
                      mode: 'number',
                      min: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <span className="text-slate-300">—</span>
                <input
                  type="number"
                  placeholder="最大"
                  value={activeFilter.max ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...activeFilter,
                      enabled: true,
                      mode: 'number',
                      max: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}

          <div className="mb-2 flex gap-2">
            <button type="button" onClick={selectAll} className="text-[10px] text-blue-600 hover:underline">
              全选
            </button>
            <button type="button" onClick={clearAll} className="text-[10px] text-blue-600 hover:underline">
              全不选
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索值..."
            className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />

          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filteredList.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={activeFilter.selectedValues.has(value)}
                  onChange={() => toggleValue(value)}
                />
                <span className="truncate" title={value}>
                  {value}
                </span>
              </label>
            ))}
            {filteredList.length === 0 && (
              <p className="py-2 text-center text-[10px] text-slate-400">无匹配项</p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ ...activeFilter, enabled: true })
                setOpen(false)
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
