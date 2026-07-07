const API_URL = 'https://api.siliconflow.cn/v1/chat/completions'
const MODEL = 'deepseek-ai/DeepSeek-V3.2'

export const SCENARIO_PROMPTS: Record<string, string> = {
  marriage: `你是婚姻家事财产分析专家。分析银行流水，重点关注：
1. 非家庭日常支出（酒店、娱乐、珠宝、大额转账给特定个人）
2. 隐匿收入线索（不明来源大额入账、频繁小额分拆入账）
3. 向特定对象的长期或集中打款
4. 异常频率支出模式`,
  lending: `你是民间借贷分析专家。分析银行流水，重点关注：
1. 借款发生时间与金额
2. 实际还款记录（含拆分还款）
3. 借-还-转资金链路
4. 当前欠款余额估算
5. 代收代付、垫付情况`,
  labor: `你是劳动争议资金分析专家。分析银行流水，重点关注：
1. 工资发放记录（规律性、金额变化）
2. 补贴、奖金、加班费
3. 扣款项目（社保、公积金、罚款）
4. 工资与实际收入差异
5. 离职前后资金变化`,
  partnership: `你是合伙纠纷资金分析专家。分析银行流水，重点关注：
1. 投资入金与分红出金
2. 异常资金往来（无合同依据的大额转账）
3. 垫付与报销模式
4. 潜在侵占或转移资产行为
5. 合伙期间资金完整性`,
  general: `你是资金往来分析专家。全面分析银行流水，识别异常交易、关键往来和潜在风险。`,
}

export interface TxInput {
  id: string
  txDate: string
  counterparty: string
  summary: string
  amount: number
  direction: string
  isRisk: boolean
  riskTags: string[]
}

export interface LlmReportResult {
  title: string
  summary: string
  keyFindings: string[]
  riskAlerts: string[]
  timeline: { date: string; event: string; amount?: number }[]
  recommendations: string[]
  keyTransactionIds: string[]
}

export function buildFallbackReport(scenario: string, transactions: TxInput[]): LlmReportResult {
  const riskTxs = transactions.filter((t) => t.isRisk)
  const totalIn = transactions.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)
  const scenarioLabels: Record<string, string> = {
    marriage: '婚姻家事',
    lending: '民间借贷',
    labor: '劳动争议',
    partnership: '合伙纠纷',
    general: '通用分析',
  }

  return {
    title: `${scenarioLabels[scenario] || '资金'}分析报告`,
    summary: `共分析 ${transactions.length} 笔交易，总收入 ¥${totalIn.toLocaleString()}，总支出 ¥${totalOut.toLocaleString()}，识别 ${riskTxs.length} 笔风险交易。`,
    keyFindings: [
      `交易总数 ${transactions.length} 笔，净流量 ¥${(totalIn - totalOut).toLocaleString()}`,
      `风险交易 ${riskTxs.length} 笔，占比 ${((riskTxs.length / Math.max(transactions.length, 1)) * 100).toFixed(1)}%`,
      riskTxs.length > 0
        ? `最大风险交易：¥${Math.max(...riskTxs.map((t) => t.amount)).toLocaleString()}`
        : '未发现明显风险交易',
    ],
    riskAlerts: riskTxs
      .slice(0, 5)
      .map(
        (t) =>
          `${t.txDate.slice(0, 10)} ${t.counterparty} ¥${t.amount.toLocaleString()} ${t.riskTags.join(',')}`,
      ),
    timeline: transactions.slice(0, 10).map((t) => ({
      date: t.txDate.slice(0, 10),
      event: `${t.counterparty} - ${t.summary}`,
      amount: t.amount,
    })),
    recommendations: [
      '建议重点关注已标记的风险交易',
      '可进一步追踪频繁往来对象',
      '建议补充缺失时段的流水以完善分析',
    ],
    keyTransactionIds: riskTxs.slice(0, 10).map((t) => t.id),
  }
}

export async function generateScenarioReport(
  apiKey: string,
  scenario: string,
  transactions: TxInput[],
  subjects: { name: string }[],
): Promise<LlmReportResult> {
  if (!transactions.length) {
    throw new Error('缺少交易数据')
  }

  const summaryTxs = transactions.slice(0, 200).map((t) => ({
    id: t.id,
    txDate: t.txDate,
    counterparty: t.counterparty,
    summary: t.summary,
    amount: t.amount,
    direction: t.direction,
    isRisk: t.isRisk,
    riskTags: t.riskTags,
  }))

  const riskStats = transactions.filter((t) => t.isRisk)
  const cpStats = new Map<string, number>()
  for (const t of transactions) {
    cpStats.set(t.counterparty, (cpStats.get(t.counterparty) || 0) + 1)
  }
  const topCp = [...cpStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  if (!apiKey) {
    return buildFallbackReport(scenario, transactions)
  }

  const system = SCENARIO_PROMPTS[scenario] || SCENARIO_PROMPTS.general
  const userContent = `请分析以下银行流水数据并返回JSON报告：
{
  "title": "报告标题",
  "summary": "200字以内分析摘要",
  "keyFindings": ["发现1", "发现2", ...],
  "riskAlerts": ["预警1", ...],
  "timeline": [{"date":"YYYY-MM-DD","event":"事件描述","amount":数字}],
  "recommendations": ["建议1", ...],
  "keyTransactionIds": ["交易id列表"]
}

追踪对象：${subjects.map((s) => s.name).join('、') || '无'}
频繁往来TOP10：${topCp.map(([n, c]) => `${n}(${c}笔)`).join('、')}
风险交易数：${riskStats.length}

交易明细（前200笔）：
${JSON.stringify(summaryTxs, null, 0)}`

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system + '\n只返回JSON，不要其他文字。' },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    return buildFallbackReport(scenario, transactions)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || '{}'
  return JSON.parse(content) as LlmReportResult
}
