import type { Handler } from '@netlify/functions'
import {
  MAX_BODY_BYTES,
  OcrPipelineError,
  getHeader,
  log,
  readBodyBuffer,
  submitPaddleJob,
} from './ocrShared'

const TOKEN = process.env.PADDLEOCR_TOKEN || ''

/** 仅提交 OCR 任务并立即返回 jobId，避免在单请求内轮询导致 Netlify 502/504 */
export const handler: Handler = async (event) => {
  const started = Date.now()
  const attempt = getHeader(event.headers, 'x-ocr-attempt') || 'initial'

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!TOKEN) {
    log('error', 'ocr', 'missing PADDLEOCR_TOKEN')
    return { statusCode: 500, body: JSON.stringify({ error: 'PADDLEOCR_TOKEN 未配置', phase: 'config' }) }
  }

  let filename = 'page.jpg'
  let imageBytes = 0

  try {
    const contentType = getHeader(event.headers, 'content-type')
    let buffer: Buffer
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

    imageBytes = buffer.length

    if (buffer.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: '请求体为空' }) }
    }

    if (buffer.length > MAX_BODY_BYTES) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: `图片过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，请在前端压缩后重试`,
          imageBytes: buffer.length,
          filename,
          attempt,
        }),
      }
    }

    log('info', 'ocr', 'submit start', { attempt, filename, imageBytes, mimeType })

    const jobId = await submitPaddleJob(TOKEN, buffer, filename, mimeType)
    const elapsedMs = Date.now() - started

    log('info', 'ocr', 'submit ok', { attempt, filename, jobId, elapsedMs })

    return {
      statusCode: 200,
      body: JSON.stringify({ jobId, state: 'pending', filename, imageBytes }),
    }
  } catch (err) {
    const elapsedMs = Date.now() - started
    const body =
      err instanceof OcrPipelineError
        ? { error: err.message, phase: err.phase, jobId: err.jobId, elapsedMs, attempt, filename, imageBytes }
        : { error: err instanceof Error ? err.message : 'OCR 提交失败', phase: 'submit', elapsedMs, attempt, filename, imageBytes }
    log('error', 'ocr', 'submit failed', body)
    return { statusCode: 500, body: JSON.stringify(body) }
  }
}
