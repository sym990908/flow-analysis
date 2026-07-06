export interface StatementCell {
  id: string
  text: string
  score?: number
  bbox?: [number, number][]
}

export interface StatementRow {
  id: string
  cells: StatementCell[]
  pageIndex: number
  isHeader?: boolean
  mergedRowCount?: number
}

export interface StatementTable {
  headers: string[]
  rows: StatementRow[]
  columnCount: number
  generatedAt: string
  sourcePages: number[]
  needsReview?: boolean
}

export type OcrWorkspaceTab = 'compare' | 'table'
