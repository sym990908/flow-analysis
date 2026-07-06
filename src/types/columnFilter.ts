export interface ColumnFilterState {
  enabled: boolean
  mode: 'values' | 'number'
  /** 多选唯一值；空 Set 表示未选任何值（隐藏全部） */
  selectedValues: Set<string>
  min?: number
  max?: number
}

export function createEmptyColumnFilter(): ColumnFilterState {
  return {
    enabled: false,
    mode: 'values',
    selectedValues: new Set(),
  }
}

export function columnFilterMatches(
  cellText: string,
  filter: ColumnFilterState | undefined,
): boolean {
  if (!filter?.enabled) return true

  const trimmed = cellText.trim()
  const display = trimmed || '(空白)'

  if (filter.min !== undefined || filter.max !== undefined) {
    const n = parseFloat(trimmed.replace(/[,，¥￥\s]/g, ''))
    if (Number.isNaN(n)) return false
    if (filter.min !== undefined && n < filter.min) return false
    if (filter.max !== undefined && n > filter.max) return false
  }

  if (filter.mode === 'values') {
    if (filter.selectedValues.size === 0) return false
    if (!filter.selectedValues.has(display)) return false
  }

  return true
}
