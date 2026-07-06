import type { FilterCriteria, ScenarioType, Transaction } from '../types'
import type { OcrBlock } from '../types/ocr'

const BASE = '/.netlify/functions'
const OCR_TIMEOUT_MS = 30_000

/** 首次失败后最多 2 次降分辨率重试（相对 2× 渲染原图） */
export const OCR_RETRY_SCALES = [0.85, 0.7] as const

async function post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
  const controller = timeoutMs ? new AbortController() : undefined
  const timer = timeoutMs
    ? setTimeout(() => controller!.abort(), timeoutMs)
    : undefined

  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const msg = (err as { error?: string }).error || res.statusText || '请求失败'
      if (res.status === 404) {
        throw new Error('后端 API 未找到，请使用 npm run dev:netlify 启动并访问 http://localhost:8888')
      }
      throw new Error(msg)
    }
    return res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('OCR 请求超时，请重试单页识别')
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface OcrPageResult {
  blocks: Omit<OcrBlock, 'id'>[]
  rawResult: unknown
  jobId: string
}

export async function ocrPageBlob(blob: Blob, filename: string, mimeType = 'image/jpeg') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Filename': encodeURIComponent(filename),
      },
      body: blob,
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const msg = (err as { error?: string }).error || res.statusText || '请求失败'
      if (res.status === 404) {
        throw new Error('后端 API 未找到，请使用 npm run dev:netlify 启动并访问 http://localhost:8888')
      }
      if (res.status === 413) {
        throw new Error(msg)
      }
      throw new Error(msg)
    }
    return res.json() as Promise<OcrPageResult>
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('OCR 请求超时，请重试单页识别')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** @deprecated 使用 ocrPageBlob 二进制上传，避免 JSON base64 膨胀 */
export async function ocrPage(base64: string, filename: string, mimeType = 'image/jpeg') {
  return post<OcrPageResult>('ocr', { base64, filename, mimeType }, OCR_TIMEOUT_MS)
}

export interface OcrBatchProgress {
  completed: number
  total: number
  failed: number
  currentPage?: number
}

export async function ocrPagesBatch(
  pages: { pageIndex: number; blob: Blob; filename: string; mimeType: string }[],
  onProgress?: (progress: OcrBatchProgress) => void,
  concurrency = 1,
): Promise<Map<number, OcrPageResult | Error>> {
  const results = new Map<number, OcrPageResult | Error>()
  let completed = 0
  let failed = 0
  const total = pages.length
  let idx = 0

  async function worker() {
    while (idx < pages.length) {
      const current = pages[idx++]
      onProgress?.({ completed, total, failed, currentPage: current.pageIndex })

      try {
        const result = await ocrPageBlob(current.blob, current.filename, current.mimeType)
        results.set(current.pageIndex, result)
      } catch (err) {
        results.set(current.pageIndex, err instanceof Error ? err : new Error('OCR 失败'))
        failed++
      }
      completed++
      onProgress?.({ completed, total, failed, currentPage: current.pageIndex })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()))
  return results
}

export async function parseTransactions(
  content: string,
  format: 'ocr' | 'excel' | 'csv' | 'table',
  sourcePlatform: string,
) {
  return post<{ transactions: Transaction[] }>('parse-transactions', {
    content,
    format,
    sourcePlatform,
  })
}

export async function inferTableSchema(sampleText: string) {
  return post<{ headers: string[]; columnMapping?: number[] }>('infer-table-schema', {
    sampleText,
  })
}

export async function analyzeScenario(
  transactions: Transaction[],
  scenario: ScenarioType,
  subjects: { name: string; accounts: string[] }[],
) {
  return post<{
    title: string
    summary: string
    keyFindings: string[]
    riskAlerts: string[]
    timeline: { date: string; event: string; amount?: number }[]
    recommendations: string[]
    keyTransactionIds: string[]
  }>('analyze-scenario', { transactions, scenario, subjects })
}

export async function parseExcelBase64(base64: string, filename: string) {
  return post<{ transactions: Transaction[]; sheets: string[] }>('parse-excel', {
    base64,
    filename,
  })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function applyFilters(transactions: Transaction[], filters: FilterCriteria): Transaction[] {
  return transactions.filter((tx) => {
    if (filters.dateFrom && tx.txDate < filters.dateFrom) return false
    if (filters.dateTo && tx.txDate > filters.dateTo + 'T23:59:59') return false
    if (filters.minAmount !== undefined && tx.amount < filters.minAmount) return false
    if (filters.maxAmount !== undefined && tx.amount > filters.maxAmount) return false
    if (filters.counterparty && !tx.counterparty.includes(filters.counterparty)) return false
    if (filters.direction && filters.direction !== 'all' && tx.direction !== filters.direction) return false
    if (filters.riskOnly && !tx.isRisk) return false
    if (filters.sourcePlatform && tx.sourcePlatform !== filters.sourcePlatform) return false
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase()
      const hay = `${tx.summary} ${tx.counterparty} ${tx.counterpartyAccount || ''}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}
