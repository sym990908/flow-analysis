import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'

const API_URL = 'https://api.siliconflow.cn/v1/chat/completions'
const API_KEY = process.env.SILICONFLOW_API_KEY || ''
const MODEL = 'deepseek-ai/DeepSeek-V3.2'

async function callLLM(system: string, user: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM 调用失败: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || '{}'
}

function fallbackParse(content: string, sourcePlatform: string) {
  const lines = content.split('\n').filter((l) => l.trim())
  const txs: unknown[] = []
  const dateRe = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/

  for (const line of lines) {
    const dateMatch = line.match(dateRe)
    const amountMatch = line.match(/[¥￥]?\s*([\d,]+\.?\d*)/g)
    if (!dateMatch || !amountMatch) continue

    const amounts = amountMatch.map((m) => parseFloat(m.replace(/[¥￥,\s]/g, ''))).filter((n) => n > 0)
    if (amounts.length === 0) continue

    txs.push({
      id: uuidv4(),
      txDate: new Date(dateMatch[1].replace(/[年月]/g, '-').replace(/日/g, '')).toISOString(),
      counterparty: '未知',
      summary: line.slice(0, 100),
      amount: amounts[amounts.length - 1],
      direction: line.includes('收') || line.includes('入') ? 'in' : 'out',
      sourcePlatform,
      isDuplicate: false,
      isRisk: false,
      riskTags: [],
      riskLevel: 'low',
      riskReasons: [],
      scenarioTags: [],
    })
  }
  return txs
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { content, format, sourcePlatform = '其他' } = JSON.parse(event.body || '{}')
    if (!content) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少内容' }) }
    }

    let transactions: unknown[] = []

    if (API_KEY) {
      const formatLabel =
        format === 'table'
          ? '结构化流水表格(TSV)，每行一条交易，列以制表符分隔'
          : format === 'ocr'
            ? 'OCR识别文本'
            : '文本数据'
      const system =
        format === 'table'
          ? `你是银行流水表格解析专家。输入为 TSV 表格（首行表头，后续每行一条交易）。
请根据表头列名识别：日期/时间→txDate，金额/借方/贷方/发生额→amount，对方/户名→counterparty，摘要/用途/备注→summary，余额→balance，借贷/方向→direction。
返回 JSON：{"transactions":[{"txDate":"ISO8601","counterparty":"对方户名","counterpartyAccount":"账号可选","summary":"摘要","amount":数字,"direction":"in或out","balance":数字可选}]}
规则：金额为正数；direction 表示收支；无法识别时 counterparty 填"未知"；跳过表头行和空行。只返回 JSON。`
          : `你是银行流水解析专家。从${formatLabel}中提取交易记录，返回JSON：
{"transactions":[{"txDate":"ISO8601","counterparty":"对方户名","counterpartyAccount":"账号可选","summary":"摘要","amount":数字,"direction":"in或out","balance":数字可选}]}
规则：金额为正数，direction表示收支方向，无法识别时counterparty填"未知"。只返回JSON。`

      const truncated = content.slice(0, format === 'table' ? 20000 : 12000)
      try {
        const result = await callLLM(system, `来源平台：${sourcePlatform}\n\n${truncated}`)
        const parsed = JSON.parse(result)
        transactions = (parsed.transactions || []).map((t: Record<string, unknown>) => ({
          id: uuidv4(),
          txDate: t.txDate || new Date().toISOString(),
          counterparty: t.counterparty || '未知',
          counterpartyAccount: t.counterpartyAccount,
          summary: t.summary || '',
          amount: Math.abs(Number(t.amount) || 0),
          direction: t.direction === 'in' ? 'in' : 'out',
          balance: t.balance ? Number(t.balance) : undefined,
          sourcePlatform,
          isDuplicate: false,
          isRisk: false,
          riskTags: [],
          riskLevel: 'low',
          riskReasons: [],
          scenarioTags: [],
        }))
      } catch {
        transactions = fallbackParse(content, sourcePlatform)
      }
    } else {
      transactions = fallbackParse(content, sourcePlatform)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ transactions }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : '解析失败' }),
    }
  }
}
