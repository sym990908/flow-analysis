import { v4 as uuidv4 } from 'uuid'
import type { RiskLevel, Transaction } from '../types'

const DEFAULT_RISK_RULES = [
  { id: 'large_amount', name: '大额转账', enabled: true, description: '超过日均3倍或5万元' },
  { id: 'frequent', name: '频繁往来', enabled: true, description: '同一对手方7天内≥5笔' },
  { id: 'off_hours', name: '异常时段', enabled: true, description: '凌晨0-6点交易' },
  { id: 'round_amount', name: '整数金额', enabled: true, description: '整万/整千大额转账' },
  { id: 'keyword', name: '敏感关键词', enabled: true, description: '含借款/还款/转账等' },
]

export { DEFAULT_RISK_RULES }

const SENSITIVE_KEYWORDS = [
  '借款', '还款', '贷款', '利息', '代付', '代收', '转账', '现金',
  '工资', '奖金', '分红', '投资', '理财', '红包', '赠予', '赔偿',
]

export function processTransactions(
  transactions: Transaction[],
  enabledRules: string[] = DEFAULT_RISK_RULES.filter((r) => r.enabled).map((r) => r.id),
  scenario?: import('../types').ScenarioType,
): Transaction[] {
  let txs = detectRisks(transactions, enabledRules)
  if (scenario) txs = tagByScenario(txs, scenario)
  return txs
}

export function detectRisks(
  transactions: Transaction[],
  enabledRules: string[] = DEFAULT_RISK_RULES.filter((r) => r.enabled).map((r) => r.id),
): Transaction[] {
  const avgAmount =
    transactions.reduce((s, t) => s + t.amount, 0) / Math.max(transactions.length, 1)

  const counterpartyCounts = new Map<string, number>()
  for (const tx of transactions) {
    const cp = tx.counterparty || '未知'
    counterpartyCounts.set(cp, (counterpartyCounts.get(cp) || 0) + 1)
  }

  return transactions.map((tx) => {
    const reasons: string[] = []
    const tags: string[] = []
    let level: RiskLevel = 'low'

    if (enabledRules.includes('large_amount')) {
      if (tx.amount >= 50000 || tx.amount >= avgAmount * 3) {
        reasons.push(`大额交易 ¥${tx.amount.toLocaleString()}`)
        tags.push('大额转账')
        level = 'high'
      }
    }

    if (enabledRules.includes('frequent')) {
      const count = counterpartyCounts.get(tx.counterparty || '未知') || 0
      if (count >= 5) {
        reasons.push(`与「${tx.counterparty}」频繁往来(${count}笔)`)
        tags.push('频繁往来')
        if (level === 'low') level = 'medium'
      }
    }

    if (enabledRules.includes('off_hours')) {
      const hour = new Date(tx.txDate).getHours()
      if (hour >= 0 && hour < 6) {
        reasons.push('异常时段交易(凌晨)')
        tags.push('异常时段')
        if (level === 'low') level = 'medium'
      }
    }

    if (enabledRules.includes('round_amount')) {
      if (tx.amount >= 10000 && tx.amount % 10000 === 0) {
        reasons.push('整万金额')
        tags.push('整数金额')
        if (level === 'low') level = 'medium'
      } else if (tx.amount >= 1000 && tx.amount % 1000 === 0 && tx.amount < 10000) {
        reasons.push('整千金额')
        tags.push('整数金额')
      }
    }

    if (enabledRules.includes('keyword')) {
      for (const kw of SENSITIVE_KEYWORDS) {
        if (tx.summary.includes(kw) || tx.counterparty.includes(kw)) {
          reasons.push(`含敏感词「${kw}」`)
          tags.push('敏感关键词')
          if (level === 'low') level = 'medium'
          break
        }
      }
    }

    return {
      ...tx,
      isRisk: reasons.length > 0,
      riskTags: [...new Set(tags)],
      riskLevel: level,
      riskReasons: reasons,
    }
  })
}

export function tagByScenario(transactions: Transaction[], scenario: string): Transaction[] {
  const scenarioKeywords: Record<string, string[]> = {
    marriage: ['餐饮', '酒店', '珠宝', '美容', '娱乐', '转账', '红包'],
    lending: ['借款', '还款', '利息', '贷款', '欠', '借'],
    labor: ['工资', '薪', '社保', '公积金', '补贴', '扣款', '奖金'],
    partnership: ['分红', '投资', '合伙', '股', '利润', '垫付'],
  }

  const keywords = scenarioKeywords[scenario] || []

  return transactions.map((tx) => {
    const tags: string[] = []
    const text = `${tx.summary} ${tx.counterparty}`
    for (const kw of keywords) {
      if (text.includes(kw)) tags.push(kw)
    }
    return { ...tx, scenarioTags: [...new Set([...tx.scenarioTags, ...tags])] }
  })
}

export function normalizeTransaction(raw: Partial<Transaction> & { amount: number; txDate: string }): Transaction {
  return {
    id: raw.id || uuidv4(),
    fileId: raw.fileId,
    txDate: raw.txDate,
    counterparty: raw.counterparty || '未知',
    counterpartyAccount: raw.counterpartyAccount,
    summary: raw.summary || '',
    amount: Math.abs(raw.amount),
    direction: raw.direction || (raw.amount >= 0 ? 'in' : 'out'),
    balance: raw.balance,
    sourcePlatform: raw.sourcePlatform || '其他',
    isDuplicate: false,
    isRisk: false,
    riskTags: [],
    riskLevel: 'low',
    riskReasons: [],
    scenarioTags: [],
    rawData: raw.rawData,
  }
}

export function getCounterpartyStats(transactions: Transaction[]) {
  const stats = new Map<string, { in: number; out: number; count: number }>()
  for (const tx of transactions) {
    const cp = tx.counterparty || '未知'
    const cur = stats.get(cp) || { in: 0, out: 0, count: 0 }
    if (tx.direction === 'in') cur.in += tx.amount
    else cur.out += tx.amount
    cur.count++
    stats.set(cp, cur)
  }
  return Array.from(stats.entries())
    .map(([name, s]) => ({ name, ...s, net: s.in - s.out }))
    .sort((a, b) => b.count - a.count)
}

export function getMonthlyStats(transactions: Transaction[]) {
  const stats = new Map<string, { in: number; out: number }>()
  for (const tx of transactions) {
    const month = tx.txDate.slice(0, 7)
    const cur = stats.get(month) || { in: 0, out: 0 }
    if (tx.direction === 'in') cur.in += tx.amount
    else cur.out += tx.amount
    stats.set(month, cur)
  }
  return Array.from(stats.entries())
    .map(([month, s]) => ({ month, ...s }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function getFundChain(
  transactions: Transaction[],
  subjectName: string,
): Transaction[] {
  return transactions
    .filter(
      (tx) =>
        tx.counterparty.includes(subjectName) ||
        tx.counterpartyAccount?.includes(subjectName),
    )
    .sort((a, b) => a.txDate.localeCompare(b.txDate))
}
