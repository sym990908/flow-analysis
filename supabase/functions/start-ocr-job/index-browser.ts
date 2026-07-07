/**
 * Supabase Dashboard → Edge Functions → Via Editor
 * 函数名：start-ocr-job
 * 同步执行 OCR（不用 waitUntil），避免后台任务 ~75s 被终止
 *
 * Secrets：PADDLEOCR_TOKEN
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-filename, x-ocr-attempt',
}

const JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
const MODEL = 'PP-OCRv6'
const MAX_BODY_BYTES = 5_500_000
const POLL_INTERVAL_MS = 800
/** 单次请求内最长轮询 Paddle（免费档 wall clock 150s） */
const MAX_POLL_MS = 140_000

const optionalPayload = {
  markdownIgnoreLabels: [],
  useDocOrientationClassify: false,
  useDocUnwarping: false,
  useTextlineOrientation: false,
  textDetLimitType: 'min',
  textDetLimitSideLen: 64,
  textDetThresh: 0.3,
  textDetBoxThresh: 0.6,
  textDetUnclipRatio: 1.5,
  textRecScoreThresh: 0,
}

interface OcrBlockResult {
  text: string
  bbox: [number, number][]
  score: number
  lineIndex: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizePoly(poly: unknown): [number, number][] {
  if (!Array.isArray(poly)) return []
  return poly.map((pt) => {
    if (Array.isArray(pt) && pt.length >= 2) {
      return [Number(pt[0]), Number(pt[1])] as [number, number]
    }
    return [0, 0] as [number, number]
  })
}

function extractBlocksFromResult(result: Record<string, unknown>): OcrBlockResult[] {
  const blocks: OcrBlockResult[] = []
  const pruned = (result.prunedResult || result) as Record<string, unknown>
  const texts = (pruned.rec_texts || pruned.texts || []) as string[]
  const scores = (pruned.rec_scores || pruned.scores || []) as number[]
  const polys = (pruned.dt_polys || pruned.rec_polys || pruned.rec_boxes || []) as unknown[]

  for (let i = 0; i < texts.length; i++) {
    const text = String(texts[i] || '').trim()
    if (!text) continue
    let bbox: [number, number][] = []
    if (polys[i]) {
      const poly = polys[i]
      if (Array.isArray(poly) && poly.length === 4 && typeof poly[0] === 'number') {
        const [x1, y1, x2, y2] = poly as number[]
        bbox = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
      } else {
        bbox = normalizePoly(poly)
      }
    }
    blocks.push({ text, bbox, score: Number(scores[i] ?? 0), lineIndex: i })
  }
  return blocks
}

function parseOcrJsonl(jsonlText: string): { blocks: OcrBlockResult[]; rawResults: unknown[] } {
  const lines = jsonlText.trim().split('\n')
  const allBlocks: OcrBlockResult[] = []
  const rawResults: unknown[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line)
    rawResults.push(parsed)
    for (const res of parsed.result?.ocrResults || [parsed.result || parsed]) {
      if (!res) continue
      allBlocks.push(...extractBlocksFromResult(res as Record<string, unknown>))
    }
  }
  return { blocks: allBlocks, rawResults }
}

async function submitPaddleJob(
  token: string,
  buffer: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append('model', MODEL)
  formData.append('optionalPayload', JSON.stringify(optionalPayload))
  formData.append('file', new Blob([buffer], { type: mimeType }), filename)

  const jobRes = await fetch(JOB_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}` },
    body: formData,
  })

  if (!jobRes.ok) {
    const errText = await jobRes.text()
    throw new Error(`OCR 提交失败 (${jobRes.status}): ${errText.slice(0, 300)}`)
  }

  const jobData = await jobRes.json()
  const jobId = jobData.data?.jobId as string | undefined
  if (!jobId) throw new Error('未获取到 Paddle jobId')
  return jobId
}

async function fetchPaddleJobState(token: string, jobId: string) {
  const res = await fetch(`${JOB_URL}/${jobId}`, {
    headers: { Authorization: `bearer ${token}` },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OCR 状态查询失败 (${res.status}): ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  return { state: data.data?.state as string | undefined, data: data.data as Record<string, unknown> }
}

async function downloadOcrResult(jsonUrl: string) {
  const jsonlRes = await fetch(jsonUrl)
  if (!jsonlRes.ok) throw new Error(`OCR 结果下载失败 (${jsonlRes.status})`)
  return parseOcrJsonl(await jsonlRes.text())
}

async function runOcrPipeline(
  token: string,
  buffer: Uint8Array,
  filename: string,
  mimeType: string,
  onProgress: (progress: number, paddleJobId?: string) => Promise<void>,
): Promise<{ blocks: OcrBlockResult[]; rawResults: unknown[]; paddleJobId: string }> {
  const paddleJobId = await submitPaddleJob(token, buffer, filename, mimeType)
  await onProgress(25, paddleJobId)

  const deadline = Date.now() + MAX_POLL_MS
  let polls = 0

  while (Date.now() < deadline) {
    polls++
    const { state, data } = await fetchPaddleJobState(token, paddleJobId)

    if (state === 'done') {
      const resultUrl = data.resultUrl as Record<string, unknown> | undefined
      const url = typeof resultUrl?.jsonUrl === 'string' ? resultUrl.jsonUrl : undefined
      if (!url) throw new Error('OCR 完成但未返回结果地址')

      const { blocks, rawResults } = await downloadOcrResult(url)
      await onProgress(100, paddleJobId)
      console.log('[start-ocr-job] paddle done', { paddleJobId, blocks: blocks.length, polls })
      return { blocks, rawResults, paddleJobId }
    }

    if (state === 'failed') {
      const error = (data.errorMsg || data.errorMessage || 'Paddle OCR 任务失败') as string
      throw new Error(error)
    }

    const elapsed = MAX_POLL_MS - (deadline - Date.now())
    const progress = Math.min(90, 25 + Math.floor((elapsed / MAX_POLL_MS) * 65))
    await onProgress(progress, paddleJobId)
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error(`OCR 轮询超时（已等待 ${MAX_POLL_MS / 1000}s）`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startedAt = Date.now()
  let jobId: string | undefined

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const paddleToken = Deno.env.get('PADDLEOCR_TOKEN') || ''

    if (!paddleToken) {
      return new Response(JSON.stringify({ error: 'PADDLEOCR_TOKEN 未配置', phase: 'config' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '登录无效，请重新登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const contentType = req.headers.get('content-type') || ''
    const filename = decodeURIComponent(req.headers.get('x-filename') || 'page.jpg')
    let buffer: Uint8Array
    let mimeType: string

    if (contentType.includes('application/json')) {
      const { base64, filename: fn, mimeType: mt } = await req.json()
      if (!base64) {
        return new Response(JSON.stringify({ error: '缺少文件数据' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      mimeType = mt || 'image/jpeg'
    } else {
      buffer = new Uint8Array(await req.arrayBuffer())
      mimeType = contentType || 'image/jpeg'
    }

    if (buffer.length === 0) {
      return new Response(JSON.stringify({ error: '请求体为空' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (buffer.length > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({
          error: `图片过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，请压缩后重试`,
          phase: 'submit',
          imageBytes: buffer.length,
        }),
        {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('[start-ocr-job] create', { userId: user.id, filename, bytes: buffer.length })

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: job, error: insertError } = await admin
      .from('ocr_jobs')
      .insert({
        user_id: user.id,
        filename,
        image_bytes: buffer.length,
        status: 'running',
        progress: 10,
      })
      .select('id')
      .single()

    if (insertError || !job) {
      return new Response(JSON.stringify({ error: insertError?.message || '创建 OCR 任务失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    jobId = job.id

    const result = await runOcrPipeline(paddleToken, buffer, filename, mimeType, async (progress, paddleJobId) => {
      await admin
        .from('ocr_jobs')
        .update({
          progress,
          ...(paddleJobId ? { paddle_job_id: paddleJobId } : {}),
        })
        .eq('id', job.id)
    })

    await admin
      .from('ocr_jobs')
      .update({
        status: 'done',
        progress: 100,
        paddle_job_id: result.paddleJobId,
        result: { blocks: result.blocks, rawResult: result.rawResults },
        error: null,
        phase: null,
      })
      .eq('id', job.id)

    console.log('[start-ocr-job] complete', { jobId, elapsedMs: Date.now() - startedAt })

    return new Response(
      JSON.stringify({
        jobId: job.id,
        state: 'done',
        filename,
        imageBytes: buffer.length,
        blocks: result.blocks,
        rawResult: result.rawResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR 失败'
    const phase = message.includes('提交') ? 'submit' : message.includes('下载') ? 'download' : 'poll'
    console.error('[start-ocr-job] error', { jobId, message, elapsedMs: Date.now() - startedAt })

    if (jobId) {
      try {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        await admin
          .from('ocr_jobs')
          .update({ status: 'error', progress: 100, error: message, phase })
          .eq('id', jobId)
      } catch {
        // ignore
      }
    }

    return new Response(JSON.stringify({ error: message, phase }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
