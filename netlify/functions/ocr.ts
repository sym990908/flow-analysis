import type { Handler } from '@netlify/functions'

const JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
const TOKEN = process.env.PADDLEOCR_TOKEN || ''
const MODEL = 'PP-OCRv6'
const MAX_BODY_BYTES = 5_500_000

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

export interface OcrBlockResult {
  text: string
  bbox: [number, number][]
  score: number
  lineIndex: number
}

async function pollJob(jobId: string): Promise<string> {
  /** 在 Netlify 26s 上限内尽量等 Paddle 跑完：约 2s 提交 + 22s 轮询 */
  const maxAttempts = 22
  const intervalMs = 1000

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${JOB_URL}/${jobId}`, {
      headers: { Authorization: `bearer ${TOKEN}` },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OCR 状态查询失败 (${res.status}): ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const state = data.data?.state

    if (state === 'done') {
      const jsonUrl = data.data?.resultUrl?.jsonUrl
      if (!jsonUrl) throw new Error('OCR 完成但未返回结果地址')
      return jsonUrl as string
    }
    if (state === 'failed') {
      throw new Error(data.data?.errorMsg || data.data?.errorMessage || 'Paddle OCR 任务失败')
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`OCR 任务超时（已等待 ${Math.round((maxAttempts * intervalMs) / 1000)} 秒）`)
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

    blocks.push({
      text,
      bbox,
      score: Number(scores[i] ?? 0),
      lineIndex: i,
    })
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
      const pageBlocks = extractBlocksFromResult(res as Record<string, unknown>)
      allBlocks.push(...pageBlocks)
    }
  }

  return { blocks: allBlocks, rawResults }
}

function getHeader(headers: Record<string, string | undefined>, name: string): string {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && v) return v
  }
  return ''
}

function readBodyBuffer(event: Parameters<Handler>[0]): Buffer {
  if (!event.body) return Buffer.alloc(0)
  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf-8')
}

async function submitToPaddle(buffer: Buffer, filename: string, mimeType: string) {
  const formData = new FormData()
  formData.append('model', MODEL)
  formData.append('optionalPayload', JSON.stringify(optionalPayload))
  formData.append('file', new Blob([buffer], { type: mimeType }), filename)

  const jobRes = await fetch(JOB_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}` },
    body: formData,
  })

  if (!jobRes.ok) {
    const errText = await jobRes.text()
    throw new Error(`OCR 提交失败 (${jobRes.status}): ${errText.slice(0, 300)}`)
  }

  const jobData = await jobRes.json()
  const jobId = jobData.data?.jobId
  if (!jobId) throw new Error('未获取到 jobId')

  const jsonUrl = await pollJob(jobId)
  const jsonlRes = await fetch(jsonUrl)
  if (!jsonlRes.ok) {
    throw new Error(`OCR 结果下载失败 (${jsonlRes.status})`)
  }
  const jsonlText = await jsonlRes.text()
  return { ...parseOcrJsonl(jsonlText), jobId }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'PADDLEOCR_TOKEN 未配置' }) }
  }

  try {
    const contentType = getHeader(event.headers, 'content-type')
    let buffer: Buffer
    let filename: string
    let mimeType: string

    if (contentType.includes('application/json')) {
      const { base64, filename: fn, mimeType: mt } = JSON.parse(event.body || '{}')
      if (!base64) {
        return { statusCode: 400, body: JSON.stringify({ error: '缺少文件数据' }) }
      }
      buffer = Buffer.from(base64, 'base64')
      filename = fn || 'page.jpg'
      mimeType = mt || 'image/jpeg'
    } else {
      buffer = readBodyBuffer(event)
      filename = decodeURIComponent(getHeader(event.headers, 'x-filename') || 'page.jpg')
      mimeType = getHeader(event.headers, 'content-type') || 'image/jpeg'
    }

    if (buffer.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: '请求体为空' }) }
    }

    if (buffer.length > MAX_BODY_BYTES) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: `图片过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，请在前端压缩后重试`,
        }),
      }
    }

    const { blocks, rawResults, jobId } = await submitToPaddle(buffer, filename, mimeType)

    return {
      statusCode: 200,
      body: JSON.stringify({ blocks, rawResult: rawResults, jobId }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'OCR 处理失败' }),
    }
  }
}
