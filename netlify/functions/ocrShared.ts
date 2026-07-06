export const JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
export const MODEL = 'PP-OCRv6'
export const MAX_BODY_BYTES = 5_500_000

export const optionalPayload = {
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

export type OcrPhase = 'submit' | 'poll' | 'download' | 'parse' | 'config'

export class OcrPipelineError extends Error {
  phase: OcrPhase
  jobId?: string

  constructor(message: string, phase: OcrPhase, jobId?: string) {
    super(message)
    this.phase = phase
    this.jobId = jobId
  }
}

export function log(level: 'info' | 'warn' | 'error', tag: string, message: string, data?: Record<string, unknown>) {
  const line = data ? `${message} ${JSON.stringify(data)}` : message
  if (level === 'error') console.error(`[${tag}] ${line}`)
  else if (level === 'warn') console.warn(`[${tag}] ${line}`)
  else console.log(`[${tag}] ${line}`)
}

export function getHeader(headers: Record<string, string | undefined>, name: string): string {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && v) return v
  }
  return ''
}

export function readBodyBuffer(event: { body?: string | null; isBase64Encoded?: boolean }): Buffer {
  if (!event.body) return Buffer.alloc(0)
  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf-8')
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

export function parseOcrJsonl(jsonlText: string): { blocks: OcrBlockResult[]; rawResults: unknown[] } {
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

export async function submitPaddleJob(
  token: string,
  buffer: Buffer,
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
    throw new OcrPipelineError(`OCR 提交失败 (${jobRes.status}): ${errText.slice(0, 300)}`, 'submit')
  }

  const jobData = await jobRes.json()
  const jobId = jobData.data?.jobId as string | undefined
  if (!jobId) throw new OcrPipelineError('未获取到 jobId', 'submit')
  return jobId
}

export async function fetchPaddleJobState(token: string, jobId: string) {
  const res = await fetch(`${JOB_URL}/${jobId}`, {
    headers: { Authorization: `bearer ${token}` },
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new OcrPipelineError(
      `OCR 状态查询失败 (${res.status}): ${errText.slice(0, 200)}`,
      'poll',
      jobId,
    )
  }

  const data = await res.json()
  const state = data.data?.state as string | undefined
  return { state, data: data.data as Record<string, unknown> }
}

export async function downloadOcrResult(jsonUrl: string, jobId: string) {
  const jsonlRes = await fetch(jsonUrl)
  if (!jsonlRes.ok) {
    throw new OcrPipelineError(`OCR 结果下载失败 (${jsonlRes.status})`, 'download', jobId)
  }
  return parseOcrJsonl(await jsonlRes.text())
}
