import { useCallback, useEffect, useRef, useState } from 'react'
import type { StatementTable } from '../../types/statementTable'
import { getConfidenceCellBg } from '../../lib/confidenceStyle'
import { ColumnFilterMenu } from './ColumnFilterMenu'
import type { ColumnFilterState } from '../../types/columnFilter'
import { createEmptyColumnFilter } from '../../types/columnFilter'
import { filterTableRows, normalizeRowCells } from '../../lib/tableReconstruction'

interface Props {
  table: StatementTable
  onChange: (table: StatementTable) => void
  onSelectionChange?: (rows: number[]) => void
  selectedRows?: number[]
}

export function StatementTableEditor({
  table,
  onChange,
  onSelectionChange,
  selectedRows = [],
}: Props) {
  const selectedRef = useRef<Set<number>>(new Set(selectedRows))
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState[]>(() =>
    Array.from({ length: table.columnCount }, () => createEmptyColumnFilter()),
  )

  useEffect(() => {
    setColumnFilters((prev) => {
      const next = [...prev]
      while (next.length < table.columnCount) next.push(createEmptyColumnFilter())
      return next.slice(0, table.columnCount)
    })
  }, [table.columnCount])

  const columnValues = table.headers.map((_, ci) =>
    table.rows.map((row) => normalizeRowCells(row, table.columnCount)[ci]?.text ?? ''),
  )

  const { rows: visibleRows, indices: visibleIndices } = filterTableRows(table, columnFilters)

  const toggleRow = useCallback(
    (rowIndex: number, multi: boolean) => {
      if (!multi) selectedRef.current = new Set()
      if (selectedRef.current.has(rowIndex)) selectedRef.current.delete(rowIndex)
      else selectedRef.current.add(rowIndex)
      onSelectionChange?.([...selectedRef.current].sort((a, b) => a - b))
    },
    [onSelectionChange],
  )

  const updateCell = (rowIndex: number, colIndex: number, text: string) => {
    const newRows = table.rows.map((row, ri) =>
      ri !== rowIndex
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, ci) =>
              ci !== colIndex ? cell : { ...cell, text },
            ),
          },
    )
    onChange({ ...table, rows: newRows })
  }

  const updateHeader = (colIndex: number, text: string) => {
    const headers = [...table.headers]
    headers[colIndex] = text
    onChange({ ...table, headers })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        显示 {visibleRows.length} / {table.rows.length} 行
      </p>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-100">
          <tr>
            <th className="w-10 border border-slate-200 px-1 py-1 text-xs text-slate-400">#</th>
            {table.headers.map((h, ci) => (
              <th key={ci} className="min-w-[120px] border border-slate-200 p-0">
                <div className="flex items-center gap-0.5 px-1">
                  <input
                    value={h}
                    onChange={(e) => updateHeader(ci, e.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-left font-semibold text-slate-700 outline-none focus:bg-blue-50"
                  />
                  <ColumnFilterMenu
                    columnIndex={ci}
                    headerLabel={h}
                    values={columnValues[ci] ?? []}
                    filter={columnFilters[ci] ?? createEmptyColumnFilter()}
                    onChange={(f) => {
                      const next = [...columnFilters]
                      next[ci] = f
                      setColumnFilters(next)
                    }}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, vi) => {
            const ri = visibleIndices[vi]
            return (
            <tr
              key={row.id}
              className={selectedRows.includes(ri) ? 'bg-blue-50' : 'hover:bg-slate-50'}
            >
              <td
                className="cursor-pointer border border-slate-200 px-1 py-1 text-center text-xs text-slate-400"
                onClick={(e) => toggleRow(ri, e.ctrlKey || e.metaKey)}
              >
                {ri + 1}
              </td>
              {table.headers.map((_, ci) => {
                const cell = row.cells[ci]
                const bg = getConfidenceCellBg(cell?.score)
                return (
                  <td key={ci} className="border border-slate-200 p-0">
                    <input
                      value={cell?.text ?? ''}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="w-full px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 focus:ring-inset"
                      style={{ backgroundColor: bg }}
                      title={cell?.score !== undefined ? `置信度 ${(cell.score * 100).toFixed(0)}%` : undefined}
                    />
                  </td>
                )
              })}
            </tr>
          )})}
        </tbody>
      </table>
      {table.rows.length === 0 && (
        <p className="p-8 text-center text-sm text-slate-400">暂无数据行，请使用工具栏插入行</p>
      )}
      </div>
    </div>
  )
}
