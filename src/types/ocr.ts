export type OcrPageStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped'
export type OcrRotation = 0 | 90 | 180 | 270

export interface OcrBlock {
  id: string
  text: string
  editedText?: string
  bbox: [number, number][]
  score: number
  lineIndex: number
}

export interface OcrPage {
  pageIndex: number
  rotation: OcrRotation
  status: OcrPageStatus
  blocks: OcrBlock[]
  rawResult?: unknown
  error?: string
  imageBlobUrl?: string
  naturalWidth?: number
  naturalHeight?: number
  /** OCR 实际发送的图片尺寸（可能与预览不同，若触发了压缩） */
  ocrImageWidth?: number
  ocrImageHeight?: number
}

export interface OcrDocument {
  fileId: string
  fileName: string
  fileType: 'pdf' | 'image'
  totalPages: number
  sourcePlatform: string
  pages: OcrPage[]
  sourceFile?: File
  statementTable?: import('./statementTable').StatementTable
}

export function createEmptyPage(pageIndex: number): OcrPage {
  return {
    pageIndex,
    rotation: 0,
    status: 'idle',
    blocks: [],
  }
}

export function getBlockText(block: OcrBlock): string {
  return block.editedText ?? block.text
}

export function mergeDocumentText(doc: OcrDocument): string {
  return doc.pages
    .filter((p) => p.status === 'done' && p.blocks.length > 0)
    .map((p) => {
      const pageText = p.blocks.map(getBlockText).join('\n')
      return `--- 第 ${p.pageIndex + 1} 页 ---\n${pageText}`
    })
    .join('\n\n')
}

/** Parse page range string like "1-5,8" into 0-based page indices */
export function parsePageRange(input: string, totalPages: number): number[] {
  const result = new Set<number>()
  const parts = input.split(/[,，]/).map((s) => s.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-')
      const start = Math.max(1, parseInt(startStr, 10))
      const end = Math.min(totalPages, parseInt(endStr, 10))
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) result.add(i - 1)
      }
    } else {
      const n = parseInt(part, 10)
      if (!isNaN(n) && n >= 1 && n <= totalPages) result.add(n - 1)
    }
  }

  return [...result].sort((a, b) => a - b)
}
