import type { Handler } from '@netlify/functions'
import {
  OcrPipelineError,
  downloadOcrResult,
  fetchPaddleJobState,
  log,
} from './ocrShared'

const TOKEN = process.env.PADDLEOCR_TOKEN || ''
/** 单次函数调用内长轮询 Paddle（减少冷启动次数） */
const LONG_POLL_MS = 22_000
const POLL_INTERVAL_MS = 800

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 长轮询 Paddle 任务：一次调用最多等待 LONG_POLL_MS，显著减少 Netlify 冷启动 */
export const handler: Handler = async (event) => {
  const started = Date.now()

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'PADDLEOCR_TOKEN 未配置', phase: 'config' }) }
  }

  try {
    const { jobId } = JSON.parse(event.body || '{}') as { jobId?: string }
    if (!jobId) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少 jobId' }) }
    }

    const deadline = Date.now() + LONG_POLL_MS
    let polls = 0

    while (Date.now() < deadline) {
      polls++
      const { state, data } = await fetchPaddleJobState(TOKEN, jobId)

      if (state === 'done') {
        const resultUrl = data.resultUrl as Record<string, unknown> | undefined
        const url = typeof resultUrl?.jsonUrl === 'string' ? resultUrl.jsonUrl : undefined
        if (!url) {
          throw new OcrPipelineError('OCR 完成但未返回结果地址', 'poll', jobId)
        }

        const { blocks, rawResults } = await downloadOcrResult(url, jobId)
        const elapsedMs = Date.now() - started
        log('info', 'ocr-status', 'done', { jobId, blocks: blocks.length, polls, elapsedMs })

        return {
          statusCode: 200,
          body: JSON.stringify({
            state: 'done',
            jobId,
            blocks,
            rawResult: rawResults,
            polls,
            elapsedMs,
          }),
        }
      }

      if (state === 'failed') {
        const error = (data.errorMsg || data.errorMessage || 'Paddle OCR 任务失败') as string
        const elapsedMs = Date.now() - started
        log('warn', 'ocr-status', 'failed', { jobId, error, polls, elapsedMs })
        return {
          statusCode: 200,
          body: JSON.stringify({ state: 'failed', jobId, error, phase: 'poll', polls, elapsedMs }),
        }
      }

      if (polls === 1) {
        log('info', 'ocr-status', 'long-poll start', { jobId, state: state ?? 'unknown' })
      }

      await sleep(POLL_INTERVAL_MS)
    }

    const elapsedMs = Date.now() - started
    log('info', 'ocr-status', 'pending', { jobId, polls, elapsedMs })
    return {
      statusCode: 200,
      body: JSON.stringify({ state: 'pending', jobId, polls, elapsedMs }),
    }
  } catch (err) {
    const elapsedMs = Date.now() - started
    const body =
      err instanceof OcrPipelineError
        ? { error: err.message, phase: err.phase, jobId: err.jobId, elapsedMs }
        : { error: err instanceof Error ? err.message : 'OCR 状态查询失败', phase: 'poll', elapsedMs }
    log('error', 'ocr-status', 'error', body)
    return { statusCode: 500, body: JSON.stringify(body) }
  }
}
