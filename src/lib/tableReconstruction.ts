import { v4 as uuidv4 } from 'uuid'
import type { OcrDocument, OcrPage } from '../types/ocr'
import { getBlockText } from '../types/ocr'
import type { StatementCell, StatementRow, StatementTable } from '../types/statementTable'
import type { ColumnFilterState } from '../types/columnFilter'
import { columnFilterMatches } from '../types/columnFilter'
import type { Transaction } from '../types'

const HEADER_KEYWORDS = /日期|时间|摘要|金额|余额|对方|借贷|收|支|账号|户名|交易|币种|借方|贷方/i

interface BboxBlock {
  id: string
  text: string
  score: number
  bbox: [number, number][]
  pageIndex: number
}

function bboxBounds(bbox: [number, number][]) {
  const xs = bbox.map(([x]) => x)
  const ys = bbox.map(([, y]) => y)
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
    height: Math.max(...ys) - Math.min(...ys),
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
  }
}

function collectBlocks(doc: OcrDocument): BboxBlock[] {
  const blocks: BboxBlock[] = []
  for (const page of doc.pages) {
    if (page.status !== 'done') continue
    for (const b of page.blocks) {
      if (b.bbox.length < 4) continue
      blocks.push({
        id: b.id,
        text: getBlockText(b),
        score: b.score,
        bbox: b.bbox,
        pageIndex: page.pageIndex,
      })
    }
  }
  return blocks
}

function clusterRows(blocks: BboxBlock[]): BboxBlock[][] {
  if (blocks.length === 0) return []

  const withBounds = blocks.map((b) => ({ b, ...bboxBounds(b.bbox) }))
  withBounds.sort((a, b) => a.centerY - b.centerY || a.xMin - b.xMin)

  const heights = withBounds.map((x) => x.height).filter((h) => h > 0)
  const medianHeight = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 20
  const threshold = medianHeight * 0.6

  const rows: BboxBlock[][] = []
  let current: BboxBlock[] = []
  let lastY = -Infinity

  for (const item of withBounds) {
    if (current.length === 0 || Math.abs(item.centerY - lastY) < threshold) {
      current.push(item.b)
      lastY = current.length === 1 ? item.centerY : (lastY + item.centerY) / 2
    } else {
      rows.push(current.sort((a, c) => bboxBounds(a.bbox).xMin - bboxBounds(c.bbox).xMin))
      current = [item.b]
      lastY = item.centerY
    }
  }
  if (current.length) {
    rows.push(current.sort((a, c) => bboxBounds(a.bbox).xMin - bboxBounds(c.bbox).xMin))
  }
  return rows
}

function detectColumnBoundaries(allBlocks: BboxBlock[]): number[] {
  const xMins = allBlocks.map((b) => bboxBounds(b.bbox).xMin).sort((a, b) => a - b)
  if (xMins.length === 0) return [0]

  const gaps: { gap: number; idx: number }[] = []
  for (let i = 1; i < xMins.length; i++) {
    gaps.push({ gap: xMins[i] - xMins[i - 1], idx: i })
  }
  gaps.sort((a, b) => b.gap - a.gap)

  const colCount = Math.min(Math.max(4, Math.ceil(gaps.length / 3)), 10)
  const splitIndices = gaps.slice(0, colCount - 1).map((g) => g.idx).sort((a, b) => a - b)

  const boundaries = [xMins[0] - 10]
  for (const idx of splitIndices) {
    boundaries.push((xMins[idx - 1] + xMins[idx]) / 2)
  }
  return boundaries
}

function assignColumn(x: number, boundaries: number[]): number {
  let col = 0
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (x >= boundaries[i]) {
      col = i
      break
    }
  }
  return Math.min(col, boundaries.length)
}

function rowToCells(row: BboxBlock[], boundaries: number[], columnCount: number): StatementCell[] {
  const cells: StatementCell[] = Array.from({ length: columnCount }, () => ({
    id: uuidv4(),
    text: '',
    score: 1,
  }))

  for (const block of row) {
    const col = Math.min(assignColumn(bboxBounds(block.bbox).centerX, boundaries), columnCount - 1)
    if (cells[col].text) {
      cells[col].text += ' ' + block.text
      cells[col].score = Math.min(cells[col].score ?? 1, block.score)
    } else {
      cells[col] = {
        id: uuidv4(),
        text: block.text,
        score: block.score,
        bbox: block.bbox,
      }
    }
  }
  return cells
}

function isHeaderRow(cells: StatementCell[]): boolean {
  const text = cells.map((c) => c.text).join('')
  return HEADER_KEYWORDS.test(text)
}

function isEmptyRow(cells: StatementCell[]): boolean {
  return cells.every((c) => !c.text.trim())
}

function mergeWrappedRows(rows: StatementRow[]): StatementRow[] {
  if (rows.length <= 1) return rows

  const merged: StatementRow[] = []
  let i = 0

  while (i < rows.length) {
    const current = rows[i]
    let combined = { ...current, cells: current.cells.map((c) => ({ ...c })) }
    let mergeCount = 1

    while (i + mergeCount < rows.length) {
      const next = rows[i + mergeCount]
      const filledCurrent = combined.cells.filter((c) => c.text.trim()).length
      const filledNext = next.cells.filter((c) => c.text.trim()).length

      const isContinuation =
        (filledNext <= 2 && filledCurrent >= 2) ||
        next.cells.every((c, idx) => !c.text.trim() || combined.cells[idx]?.text.trim() === '')

      if (isContinuation && !next.isHeader) {
        for (let c = 0; c < combined.cells.length; c++) {
          if (next.cells[c]?.text.trim()) {
            combined.cells[c].text = combined.cells[c].text
              ? `${combined.cells[c].text} ${next.cells[c].text}`.trim()
              : next.cells[c].text
            combined.cells[c].score = Math.min(
              combined.cells[c].score ?? 1,
              next.cells[c].score ?? 1,
            )
          }
        }
        mergeCount++
      } else {
        break
      }
    }

    combined.mergedRowCount = mergeCount
    merged.push(combined)
    i += mergeCount
  }

  return merged
}

function headersSimilar(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  let match = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i].trim() === b[i].trim()) match++
    else if (a[i].includes(b[i]) || b[i].includes(a[i])) match++
  }
  return match / a.length >= 0.8
}

function buildPageTable(page: OcrPage, boundaries: number[], columnCount: number): StatementRow[] {
  const blocks = page.blocks
    .filter((b) => b.bbox.length >= 4)
    .map((b) => ({
      id: b.id,
      text: getBlockText(b),
      score: b.score,
      bbox: b.bbox,
      pageIndex: page.pageIndex,
    }))

  const physicalRows = clusterRows(blocks)
  return physicalRows.map((row) => {
    const cells = rowToCells(row, boundaries, columnCount)
    return {
      id: uuidv4(),
      cells,
      pageIndex: page.pageIndex,
      isHeader: isHeaderRow(cells),
    }
  })
}

export function reconstructStatementTable(doc: OcrDocument): StatementTable {
  const allBlocks = collectBlocks(doc)
  if (allBlocks.length === 0) {
    return {
      headers: ['列1', '列2', '列3', '列4'],
      rows: [],
      columnCount: 4,
      generatedAt: new Date().toISOString(),
      sourcePages: [],
      needsReview: true,
    }
  }

  const boundaries = detectColumnBoundaries(allBlocks)
  const columnCount = boundaries.length

  const donePages = doc.pages.filter((p) => p.status === 'done' && p.blocks.length > 0)
  let allRows: StatementRow[] = []
  let headers: string[] = []
  let headerFound = false

  for (const page of donePages) {
    let pageRows = buildPageTable(page, boundaries, columnCount)

    pageRows = mergeWrappedRows(pageRows)

    if (pageRows.length > 0 && pageRows[0].isHeader) {
      const candidateHeaders = pageRows[0].cells.map((c) => c.text || `列${c.id.slice(0, 4)}`)
      if (!headerFound) {
        headers = candidateHeaders
        headerFound = true
        pageRows = pageRows.slice(1)
      } else if (headersSimilar(headers, candidateHeaders)) {
        pageRows = pageRows.slice(1)
      }
    }

    pageRows = pageRows.filter((r) => !isEmptyRow(r.cells))
    allRows = allRows.concat(pageRows)
  }

  if (!headerFound) {
    headers = Array.from({ length: columnCount }, (_, i) => `列${i + 1}`)
  }

  while (headers.length < columnCount) {
    headers.push(`列${headers.length + 1}`)
  }

  return {
    headers: headers.slice(0, columnCount),
    rows: allRows,
    columnCount,
    generatedAt: new Date().toISOString(),
    sourcePages: donePages.map((p) => p.pageIndex),
    needsReview: !headerFound,
  }
}

export function tableToParseContent(table: StatementTable): string {
  const lines = [table.headers.join('\t')]
  for (const row of table.rows) {
    const cells = row.cells.map((c) => c.text.replace(/\s+/g, ' ').trim())
    while (cells.length < table.columnCount) cells.push('')
    lines.push(cells.slice(0, table.columnCount).join('\t'))
  }
  return lines.join('\n')
}

export function setFirstRowAsHeader(table: StatementTable): StatementTable {
  if (table.rows.length === 0) return table
  const first = table.rows[0]
  return {
    ...table,
    headers: first.cells.map((c, i) => c.text.trim() || table.headers[i] || `列${i + 1}`),
    rows: table.rows.slice(1),
    needsReview: false,
  }
}

export function normalizeRowCells(row: StatementRow, columnCount: number): StatementCell[] {
  const cells = row.cells.map((c) => ({ ...c }))
  while (cells.length < columnCount) {
    cells.push({ id: uuidv4(), text: '' })
  }
  return cells.slice(0, columnCount)
}

export function normalizeTable(table: StatementTable): StatementTable {
  const columnCount = table.columnCount
  const headers = [...table.headers]
  while (headers.length < columnCount) {
    headers.push(`列${headers.length + 1}`)
  }
  return {
    ...table,
    headers: headers.slice(0, columnCount),
    rows: table.rows.map((row) => ({
      ...row,
      cells: normalizeRowCells(row, columnCount),
    })),
  }
}

export function mergeSelectedRows(table: StatementTable, rowIndices: number[]): StatementTable {
  if (rowIndices.length < 2) return table
  const normalized = normalizeTable(table)
  const sorted = [...rowIndices].sort((a, b) => a - b)
  const colCount = normalized.columnCount
  const firstIdx = sorted[0]
  const firstRow = normalized.rows[firstIdx]

  // 将 n 行按行序横向拉伸为一行：每行各列依次拼接，列数 = n × 原列数
  const stretchedCells: StatementCell[] = []
  for (const rowIdx of sorted) {
    const rowCells = normalizeRowCells(normalized.rows[rowIdx], colCount)
    for (const cell of rowCells) {
      stretchedCells.push({
        ...cell,
        id: uuidv4(),
        text: cell.text.trim(),
      })
    }
  }

  const newColumnCount = stretchedCells.length
  const newHeaders = [...normalized.headers]
  for (let i = colCount; i < newColumnCount; i++) {
    newHeaders.push(`列${i + 1}`)
  }

  const mergedRow: StatementRow = {
    ...firstRow,
    cells: stretchedCells,
    mergedRowCount: sorted.length,
  }

  const removeSet = new Set(sorted)
  const rowsWithoutMerged = normalized.rows.filter((_, idx) => !removeSet.has(idx))
  const insertAt = sorted.filter((x) => x < firstIdx).length
  rowsWithoutMerged.splice(insertAt, 0, mergedRow)

  return {
    ...normalized,
    columnCount: newColumnCount,
    headers: newHeaders.slice(0, newColumnCount),
    rows: rowsWithoutMerged.map((row) => ({
      ...row,
      cells: normalizeRowCells(row, newColumnCount),
    })),
  }
}

export function updateTableCell(
  table: StatementTable,
  rowIndex: number,
  colIndex: number,
  text: string,
): StatementTable {
  return {
    ...table,
    rows: table.rows.map((row, ri) =>
      ri !== rowIndex
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, ci) =>
              ci !== colIndex ? cell : { ...cell, text },
            ),
          },
    ),
  }
}

export function insertTableRow(table: StatementTable, afterIndex?: number): StatementTable {
  const newRow: StatementRow = {
    id: uuidv4(),
    pageIndex: 0,
    cells: Array.from({ length: table.columnCount }, () => ({
      id: uuidv4(),
      text: '',
    })),
  }
  const rows = [...table.rows]
  const idx = afterIndex === undefined ? rows.length : afterIndex + 1
  rows.splice(idx, 0, newRow)
  return { ...table, rows }
}

export function deleteTableRows(table: StatementTable, indices: number[]): StatementTable {
  const set = new Set(indices)
  return { ...table, rows: table.rows.filter((_, i) => !set.has(i)) }
}

export function insertTableColumn(table: StatementTable): StatementTable {
  const colIdx = table.columnCount
  return {
    ...table,
    columnCount: colIdx + 1,
    headers: [...table.headers, `列${colIdx + 1}`],
    rows: table.rows.map((row) => ({
      ...row,
      cells: [...row.cells, { id: uuidv4(), text: '' }],
    })),
  }
}

export function deleteTableColumn(table: StatementTable, colIndex: number): StatementTable {
  if (table.columnCount <= 1) return table
  return {
    ...table,
    columnCount: table.columnCount - 1,
    headers: table.headers.filter((_, i) => i !== colIndex),
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, i) => i !== colIndex),
    })),
  }
}

export function applyInferredHeaders(
  table: StatementTable,
  headers: string[],
): StatementTable {
  const columnCount = Math.max(table.columnCount, headers.length)
  return normalizeTable({
    ...table,
    headers: headers.slice(0, columnCount),
    columnCount,
    needsReview: false,
  })
}

interface ColumnMapping {
  date?: number
  amount?: number
  counterparty?: number
  account?: number
  summary?: number
  balance?: number
  direction?: number
}

function mapHeadersToColumns(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {}
  headers.forEach((h, i) => {
    const t = h.trim()
    if (/日期|时间/.test(t)) map.date = i
    else if (/账号|账户|卡号|account/i.test(t)) map.account = i
    else if (/金额|借方|贷方|发生额|收入|支出/.test(t)) map.amount = map.amount ?? i
    else if (/对方|户名|名称|交易对手/.test(t)) map.counterparty = i
    else if (/摘要|用途|备注|说明/.test(t)) map.summary = i
    else if (/余额/.test(t)) map.balance = i
    else if (/借贷|方向|收|支/.test(t)) map.direction = i
  })
  return map
}

function isLikelyAccountNumber(text: string): boolean {
  const t = text.replace(/[\s-]/g, '')
  if (!t) return false
  if (/^\d{10,22}$/.test(t)) return true
  if (/^\d{4,6}\*{2,}\d{2,8}$/.test(t)) return true
  return false
}

function isLikelyAmount(text: string): boolean {
  const t = text.trim()
  if (!t || isLikelyAccountNumber(t)) return false
  if (/[¥￥]/.test(t)) return true
  if (/\.\d{1,2}$/.test(t.replace(/[,，\s]/g, ''))) return true
  const n = parseFloat(t.replace(/[,，¥￥\s]/g, ''))
  if (Number.isNaN(n) || n === 0) return false
  if (n >= 1_000_000_000) return false
  return true
}

function parseAmount(text: string): number {
  if (!text.trim() || isLikelyAccountNumber(text)) return 0
  if (!isLikelyAmount(text)) return 0
  const m = text.replace(/[,，¥￥\s]/g, '').match(/-?\d+\.?\d*/)
  return m ? Math.abs(parseFloat(m[0])) : 0
}

function parseDate(text: string): string | null {
  const m = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
  if (!m) return null
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function inferDirection(text: string, amountCol?: string): 'in' | 'out' {
  const t = `${text} ${amountCol || ''}`
  if (/收|入|贷|进/.test(t) && !/支|出|借/.test(t)) return 'in'
  if (/支|出|借|付/.test(t)) return 'out'
  return 'out'
}

function rowToTransaction(
  cells: StatementCell[],
  colMap: ColumnMapping,
  sourcePlatform: string,
  fileId?: string,
): Transaction | null {
  const get = (idx?: number) => (idx !== undefined ? cells[idx]?.text.trim() ?? '' : '')

  let txDate = parseDate(get(colMap.date))
  if (!txDate) {
    for (const c of cells) {
      txDate = parseDate(c.text)
      if (txDate) break
    }
  }

  let amount = 0
  if (colMap.amount !== undefined) {
    amount = parseAmount(get(colMap.amount))
  }
  if (amount === 0 && colMap.amount === undefined) {
    for (let ci = 0; ci < cells.length; ci++) {
      if (ci === colMap.account || ci === colMap.date || ci === colMap.balance) continue
      const cellText = cells[ci]?.text.trim() ?? ''
      if (isLikelyAmount(cellText)) {
        amount = parseAmount(cellText)
        if (amount > 0) break
      }
    }
  }

  if (!txDate && amount === 0) return null

  const counterparty = get(colMap.counterparty) || '未知'
  const counterpartyAccount = get(colMap.account) || undefined
  const summary = get(colMap.summary) || cells.map((c) => c.text).join(' ').slice(0, 100)
  const dirText = get(colMap.direction)
  const direction = inferDirection(dirText, get(colMap.amount))

  return {
    id: uuidv4(),
    fileId,
    txDate: txDate || new Date().toISOString(),
    counterparty,
    counterpartyAccount,
    summary,
    amount,
    direction,
    balance: colMap.balance !== undefined ? parseAmount(get(colMap.balance)) : undefined,
    sourcePlatform,
    isDuplicate: false,
    isRisk: false,
    riskTags: [],
    riskLevel: 'low',
    riskReasons: [],
    scenarioTags: [],
  }
}

export function parseTableToTransactions(
  table: StatementTable,
  sourcePlatform: string,
  fileId?: string,
): Transaction[] {
  const normalized = normalizeTable(table)
  const colMap = mapHeadersToColumns(normalized.headers)
  const txs: Transaction[] = []

  for (const row of normalized.rows) {
    if (row.isHeader) continue
    const cells = normalizeRowCells(row, normalized.columnCount)
    if (cells.every((c) => !c.text.trim())) continue
    const joined = cells.map((c) => c.text).join('')
    if (HEADER_KEYWORDS.test(joined) && !parseDate(cells[colMap.date ?? 0]?.text || '')) continue
    const tx = rowToTransaction(cells, colMap, sourcePlatform, fileId)
    if (tx) txs.push(tx)
  }

  return txs
}

export function filterTableRows(
  table: StatementTable,
  columnFilters: ColumnFilterState[],
): { rows: StatementRow[]; indices: number[] } {
  const indices: number[] = []
  const rows = table.rows.filter((row, ri) => {
    const cells = normalizeRowCells(row, table.columnCount)
    const match = columnFilters.every((filter, ci) =>
      columnFilterMatches(cells[ci]?.text ?? '', filter),
    )
    if (match) indices.push(ri)
    return match
  })
  return { rows, indices }
}
