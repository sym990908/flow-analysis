import type { Handler } from '@netlify/functions'

const API_URL = 'https://api.siliconflow.cn/v1/chat/completions'
const API_KEY = process.env.SILICONFLOW_API_KEY || ''
const MODEL = 'deepseek-ai/DeepSeek-V3.2'

const DEFAULT_HEADERS = ['交易日期', '对方户名', '摘要', '收入', '支出', '余额']

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { sampleText, columnCount, mergeGroupSize } = JSON.parse(event.body || '{}')
    if (!sampleText) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少样本文本' }) }
    }

    const totalCols = typeof columnCount === 'number' && columnCount > 0 ? columnCount : undefined
    const groupSize = typeof mergeGroupSize === 'number' && mergeGroupSize > 1 ? mergeGroupSize : undefined
    const baseColCount = totalCols && groupSize ? totalCols / groupSize : totalCols

    const userPrompt =
      baseColCount && groupSize
        ? `以下是从银行流水 OCR 还原的表格样本（制表符分隔）。表格共 ${totalCols} 列，由 ${groupSize} 行 OCR 横向合并而成，每组 ${baseColCount} 列。请推断每组的基础列名（返回 ${baseColCount} 个），常见：日期、对方、摘要、借方、贷方、余额、金额。\n\n${String(sampleText).slice(0, 4000)}`
        : totalCols
          ? `以下是从银行流水 OCR 还原的表格样本（制表符分隔），共 ${totalCols} 列。请推断列名，返回 ${totalCols} 个。\n\n${String(sampleText).slice(0, 4000)}`
          : String(sampleText).slice(0, 4000)

    if (!API_KEY) {
      return {
        statusCode: 200,
        body: JSON.stringify({ headers: DEFAULT_HEADERS }),
      }
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              '你是银行流水表头识别专家。根据 OCR 文本样本推断列名，返回 JSON：{"headers":["列1","列2",...]}。若用户说明表格由多行合并，只需返回每组的基础列名（不要重复）。只返回 JSON。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ headers: DEFAULT_HEADERS }),
      }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    const headers = Array.isArray(parsed.headers) ? parsed.headers.map(String) : DEFAULT_HEADERS

    return {
      statusCode: 200,
      body: JSON.stringify({ headers }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : '推断失败' }),
    }
  }
}
