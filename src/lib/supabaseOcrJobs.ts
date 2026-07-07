import { getSupabase, getSupabaseFunctionsUrl, isSupabaseConfigured } from './supabase'
import type { OcrBlock } from '../types/ocr'

export interface RemoteOcrJobRow {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  result: { blocks: Omit<OcrBlock, 'id'>[]; rawResult: unknown } | null
  error: string | null
  phase: string | null
  paddle_job_id: string | null
}

export async function isSupabaseOcrAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  const supabase = getSupabase()
  if (!supabase) return false
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return !!session
}

export interface SubmitRemoteOcrJobResult {
  jobId: string
  blocks?: Omit<OcrBlock, 'id'>[]
  rawResult?: unknown
}

export async function submitRemoteOcrJob(
  blob: Blob,
  filename: string,
  mimeType: string,
  attempt: string,
): Promise<SubmitRemoteOcrJobResult> {
  const supabase = getSupabase()
  const functionsUrl = getSupabaseFunctionsUrl()
  if (!supabase || !functionsUrl) throw new Error('Supabase 未配置')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('请先登录后再使用 OCR')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 150_000)

  let res: Response
  try {
    res = await fetch(`${functionsUrl}/start-ocr-job`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': mimeType,
        'X-Filename': encodeURIComponent(filename),
        'X-Ocr-Attempt': attempt,
      },
      body: blob,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('OCR 请求超时（>150s），请重试单页识别')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `OCR 提交失败 (${res.status})`)
  }

  return {
    jobId: data.jobId as string,
    blocks: data.blocks as Omit<OcrBlock, 'id'>[] | undefined,
    rawResult: data.rawResult as unknown,
  }
}

export async function fetchRemoteOcrJob(jobId: string): Promise<RemoteOcrJobRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('ocr_jobs')
    .select('id, status, progress, result, error, phase, paddle_job_id')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as RemoteOcrJobRow | null
}

export async function pollRemoteOcrJob(
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number; onProgress?: (progress: number) => void },
): Promise<RemoteOcrJobRow> {
  const intervalMs = options?.intervalMs ?? 2000
  const timeoutMs = options?.timeoutMs ?? 150_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const row = await fetchRemoteOcrJob(jobId)
    if (!row) throw new Error('OCR 任务不存在')
    options?.onProgress?.(row.progress)

    if (row.status === 'done') return row
    if (row.status === 'error') {
      const parts = [row.error || 'OCR 失败']
      if (row.phase) parts.push(`阶段: ${row.phase}`)
      throw new Error(parts.join(' · '))
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(`OCR 轮询超时（已等待 ${timeoutMs / 1000}s）`)
}
