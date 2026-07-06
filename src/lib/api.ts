import type { FilterCriteria, ScenarioType, Transaction } from '../types'
import type { OcrBlock } from '../types/ocr'

const BASE = '/.netlify/functions'
/** 整页 OCR 最长等待（含多轮长轮询） */
export const OCR_TIMEOUT_MS = 120_000
/** 提交图片（含上传大图）— 需小于 Netlify ~30s 网关 */
const OCR_SUBMIT_TIMEOUT_MS = 28_000
/** 单次长轮询上限（服务端最多等 ~22s） */
const OCR_LONG_POLL_TIMEOUT_MS = 27_000
const OCR_POLL_GAP_MS = 200

/** PDF 默认 1× OCR */
export const OCR_PDF_RENDER_SCALE = 1
/** PDF 失败重试渲染倍率（1× + 压缩） */
export const OCR_PDF_RETRY_RENDER_SCALE = 1

export interface OcrApiErrorBody {
  error: string
  phase?: string
  elapsedMs?: number
  jobId?: string
  attempt?: string
  filename?: string
  imageBytes?: number
}

function formatOcrError(body: OcrApiErrorBody, status: number): string {
  const parts = [body.error || `HTTP ${status}`]
  if (body.phase) parts.push(`阶段: ${body.phase}`)
  if (body.elapsedMs != null) parts.push(`耗时: ${(body.elapsedMs / 1000).toFixed(1)}s`)
  if (body.jobId) parts.push(`job: ${body.jobId.slice(0, 8)}…`)
  return parts.join(' · ')
}

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

interface OcrSubmitResponse {
  jobId: string
  state: 'pending'
}

interface OcrStatusResponse {
  state: 'pending' | 'done' | 'failed'
  jobId: string
  blocks?: Omit<OcrBlock, 'id'>[]
  rawResult?: unknown
  error?: string
  phase?: string
  elapsedMs?: number
  polls?: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: T | OcrApiErrorBody }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const data = (await res.json().catch(() => ({ error: res.statusText }))) as T | OcrApiErrorBody
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`请求超时（>${timeoutMs / 1000}s）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function pollOcrJob(jobId: string, attempt: string, filename: string): Promise<OcrPageResult> {
  const pollStarted = performance.now()
  let rounds = 0

  while (performance.now() - pollStarted < OCR_TIMEOUT_MS) {
    rounds++
    const { ok, status, data } = await fetchJson<OcrStatusResponse>(
      `${BASE}/ocr-status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      },
      OCR_LONG_POLL_TIMEOUT_MS,
    )

    if (!ok) {
      const err = data as OcrApiErrorBody
      console.warn('[ocr] poll http error', { attempt, filename, jobId, status, round: rounds, ...err })
      if (status === 502 || status === 504) {
        await sleep(OCR_POLL_GAP_MS)
        continue
      }
      throw new Error(formatOcrError(err, status))
    }

    const body = data as OcrStatusResponse

    if (body.state === 'done') {
      console.info('[ocr] poll done', {
        attempt,
        filename,
        jobId,
        blocks: body.blocks?.length ?? 0,
        rounds,
        elapsed: Math.round(performance.now() - pollStarted),
      })
      return {
        jobId: body.jobId,
        blocks: body.blocks ?? [],
        rawResult: body.rawResult,
      }
    }

    if (body.state === 'failed') {
      const msg = formatOcrError(
        { error: body.error || 'Paddle OCR 任务失败', phase: body.phase, jobId: body.jobId },
        200,
      )
      console.warn('[ocr] paddle failed', { attempt, filename, jobId, error: body.error, rounds })
      throw new Error(msg)
    }

    console.info('[ocr] poll pending', {
      attempt,
      filename,
      jobId,
      rounds,
      serverMs: body.elapsedMs,
    })
    await sleep(OCR_POLL_GAP_MS)
  }

  throw new Error(`OCR 轮询超时（已等待 ${OCR_TIMEOUT_MS / 1000}s）`)
}

export async function ocrPageBlob(
  blob: Blob,
  filename: string,
  mimeType = 'image/jpeg',
  attempt: 'initial' | 'retry-1x' = 'initial',
) {
  const started = performance.now()

  try {
    const submit = await fetchJson<OcrSubmitResponse>(
      `${BASE}/ocr`,
      {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-Filename': encodeURIComponent(filename),
          'X-Ocr-Attempt': attempt,
        },
        body: blob,
      },
      OCR_SUBMIT_TIMEOUT_MS,
    )

    const submitElapsed = Math.round(performance.now() - started)

    if (!submit.ok) {
      const err = submit.data as OcrApiErrorBody
      const msg = formatOcrError(err, submit.status)
      console.warn('[ocr] submit failed', { attempt, filename, status: submit.status, submitElapsed, ...err })
      if (submit.status === 404) {
        throw new Error('后端 API 未找到，请使用 npm run dev:netlify 启动并访问 http://localhost:8888')
      }
      if (submit.status === 502 || submit.status === 504) {
        throw new Error(`OCR 网关超时 (${submit.status})，请稍后重试单页识别`)
      }
      if (submit.status === 413) {
        throw new Error(msg)
      }
      throw new Error(msg)
    }

    const { jobId } = submit.data as OcrSubmitResponse
    console.info('[ocr] submitted', { attempt, filename, jobId, submitElapsed, bytes: blob.size })

    const result = await pollOcrJob(jobId, attempt, filename)
    const elapsed = Math.round(performance.now() - started)
    console.info('[ocr] ok', { attempt, filename, elapsed, blocks: result.blocks.length, jobId: result.jobId })
    return result
  } catch (err) {
    if (err instanceof Error && err.message.includes('请求超时')) {
      const elapsed = Math.round(performance.now() - started)
      console.warn('[ocr] client timeout', { attempt, filename, elapsed, limitMs: OCR_TIMEOUT_MS })
    }
    throw err
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

export async function inferTableSchema(
  sampleText: string,
  options?: { columnCount?: number; mergeGroupSize?: number },
) {
  return post<{ headers: string[]; columnMapping?: number[] }>('infer-table-schema', {
    sampleText,
    columnCount: options?.columnCount,
    mergeGroupSize: options?.mergeGroupSize,
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
