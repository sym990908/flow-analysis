import { loadPdfDocument, getCachedPdf } from './pdfUtils'
import type { OcrDocument } from '../types/ocr'
import { createEmptyPage } from '../types/ocr'

export async function createOcrDocumentFromFile(
  file: File,
  fileId: string,
  sourcePlatform: string,
): Promise<OcrDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  if (ext === 'pdf') {
    const pdf = getCachedPdf(fileId) ?? await loadPdfDocument(file, fileId)
    const totalPages = pdf.numPages
    return {
      fileId,
      fileName: file.name,
      fileType: 'pdf',
      totalPages,
      sourcePlatform,
      sourceFile: file,
      pages: Array.from({ length: totalPages }, (_, i) => createEmptyPage(i)),
    }
  }

  return {
    fileId,
    fileName: file.name,
    fileType: 'image',
    totalPages: 1,
    sourcePlatform,
    sourceFile: file,
    pages: [createEmptyPage(0)],
  }
}

export function isOcrFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)
}

export function isExcelFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ['xlsx', 'xls', 'csv'].includes(ext)
}
