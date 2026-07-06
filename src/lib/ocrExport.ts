import * as XLSX from 'xlsx'
import type { OcrDocument } from '../types/ocr'
import type { StatementTable } from '../types/statementTable'

export function exportOcrJson(doc: OcrDocument) {
  const exportData = {
    fileId: doc.fileId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    totalPages: doc.totalPages,
    sourcePlatform: doc.sourcePlatform,
    pages: doc.pages.map((p) => ({
      pageIndex: p.pageIndex,
      rotation: p.rotation,
      status: p.status,
      blocks: p.blocks.map((b) => ({
        id: b.id,
        text: b.text,
        editedText: b.editedText,
        bbox: b.bbox,
        score: b.score,
        lineIndex: b.lineIndex,
      })),
      rawResult: p.rawResult,
    })),
    statementTable: doc.statementTable,
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${doc.fileName}-ocr.json`)
}

export function exportOcrBlocksCsv(doc: OcrDocument) {
  const rows = doc.pages.flatMap((p) =>
    p.blocks.map((b) => ({
      page: p.pageIndex + 1,
      lineIndex: b.lineIndex,
      text: b.text,
      editedText: b.editedText || '',
      score: b.score.toFixed(4),
      bbox_json: JSON.stringify(b.bbox),
    })),
  )

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'OCR块')
  XLSX.writeFile(wb, `${doc.fileName}-ocr-blocks.csv`)
}

export function exportStatementTableCsv(table: StatementTable, fileName: string) {
  const rows = table.rows.map((row) => {
    const record: Record<string, string> = {}
    table.headers.forEach((h, i) => {
      record[h] = row.cells[i]?.text ?? ''
    })
    return record
  })

  const ws = XLSX.utils.json_to_sheet(rows, { header: table.headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '流水表')
  XLSX.writeFile(wb, `${fileName}-statement.csv`)
}

export function exportStatementTableExcel(table: StatementTable, fileName: string) {
  const aoa: string[][] = [table.headers]
  for (const row of table.rows) {
    aoa.push(table.headers.map((_, i) => row.cells[i]?.text ?? ''))
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '流水表')
  XLSX.writeFile(wb, `${fileName}-statement.xlsx`)
}

/** @deprecated use exportOcrBlocksCsv */
export const exportOcrCsv = exportOcrBlocksCsv

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
