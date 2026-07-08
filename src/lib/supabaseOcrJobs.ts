import { v4 as uuidv4 } from 'uuid'
import { getSupabase, getSupabaseFunctionsUrl, isSupabaseConfigured } from './supabase'
import type { OcrBlock } from '../types/ocr'

const OCR_SOURCE_BUCKET = 'ocr-sources'
const MAX_OCR_BYTES = 5_500_000

export interface RemoteOcrJobRow {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  result: { blocks: Omit<OcrBlock, 'id'>[]; rawResult?: unknown } | null
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

function sanitizeStorageFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'page.jpg'
  return base.replace(/[^\w.\-()+\u4e00-\u9fff]/g, '_').slice(0, 120) || 'page.jpg'
}

/**
 * 浏览器 → Supabase Storage（唯一大图上传）→ Edge Function 只收 JSON 路径 → Paddle。
 * 避免图片 bytes 再经 Edge HTTP 入站重复传输。
 */
export async function submitRemoteOcrJob(
  blob: Blob,
  filename: string,
  mimeType: string,
  attempt: string,
): Promise<SubmitRemoteOcrJobResult> {
  const supabase = getSupabase()
  const functionsUrl = getSupabaseFunctionsUrl()
  if (!supabase || !functionsUrl) throw new Error('Supabase 未配置')

  if (blob.size > MAX_OCR_BYTES) {
    throw new Error(
      `图片过大 (${(blob.size / 1024 / 1024).toFixed(1)}MB)，请压缩后重试（上限 ${(MAX_OCR_BYTES / 1024 / 1024).toFixed(1)}MB）`,
    )
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('请先登录后再使用 OCR')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('请先登录后再使用 OCR')

  const jobId = uuidv4()
  const safeName = sanitizeStorageFilename(filename)
  const storagePath = `${user.id}/${jobId}/${safeName}`

  const { error: insertError } = await supabase.from('ocr_jobs').insert({
    id: jobId,
    user_id: user.id,
    filename: safeName,
    image_bytes: blob.size,
    storage_path: storagePath,
    status: 'pending',
    progress: 5,
  })

  if (insertError) {
    throw new Error(insertError.message || '创建 OCR 任务失败')
  }

  const { error: uploadError } = await supabase.storage.from(OCR_SOURCE_BUCKET).upload(storagePath, blob, {
    contentType: mimeType || 'image/jpeg',
    upsert: true,
  })

  if (uploadError) {
    await supabase
      .from('ocr_jobs')
      .update({ status: 'error', progress: 100, error: uploadError.message, phase: 'upload' })
      .eq('id', jobId)
    throw new Error(`上传图片失败: ${uploadError.message}`)
  }

  console.info('[ocr] storage uploaded', { jobId, storagePath, bytes: blob.size })

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
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        storagePath,
        filename: safeName,
        mimeType: mimeType || 'image/jpeg',
        attempt,
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('OCR 请求超时（>150s），可在 ocr_jobs 表查看任务状态')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `OCR 失败 (${res.status})`)
  }

  const row = await fetchRemoteOcrJob(data.jobId as string)
  if (!row || row.status !== 'done' || !row.result?.blocks) {
    throw new Error('OCR 完成但未读取到结果')
  }

  return {
    jobId: row.id,
    blocks: row.result.blocks,
    rawResult: row.result.rawResult,
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
