import type { Handler } from '@netlify/functions'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'

interface RawTx {
  id: string
  txDate: string
  counterparty: string
  counterpartyAccount?: string
  summary: string
  amount: number
  direction: 'in' | 'out'
  balance?: number
  sourcePlatform: string
  isDuplicate: boolean
  isRisk: boolean
  riskTags: string[]
  riskLevel: 'low'
  riskReasons: string[]
  scenarioTags: string[]
}

const DATE_KEYS = ['交易时间', '交易日期', '日期', '记账日期', 'date', 'time', 'datetime']
const CP_KEYS = ['对方户名', '对方名称', '交易对手', '对方', 'counterparty', 'name']
const CP_ACC_KEYS = ['对方账号', '对方卡号', '账号', 'account']
const SUMMARY_KEYS = ['摘要', '用途', '备注', '说明', 'summary', 'memo', 'description']
const AMOUNT_KEYS = ['金额', '交易金额', '发生额', 'amount', 'money']
const DIR_KEYS = ['借贷', '方向', '收支', 'direction', 'type']
const BALANCE_KEYS = ['余额', 'balance']

function findCol(headers: string[], keys: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase().trim()
    for (const k of keys) {
      if (h.includes(k.toLowerCase())) return i
    }
  }
  return -1
}

function parseDate(val: unknown): string {
  if (!val) return new Date().toISOString()
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0).toISOString()
  }
  const str = String(val).trim()
  const parsed = new Date(str.replace(/\//g, '-'))
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return Math.abs(val)
  const str = String(val).replace(/[,，¥￥\s]/g, '')
  return Math.abs(parseFloat(str) || 0)
}

function parseDirection(val: unknown, amount: number): 'in' | 'out' {
  const str = String(val || '').toLowerCase()
  if (str.includes('收') || str.includes('入') || str.includes('贷') || str === 'in' || str === 'credit') return 'in'
  if (str.includes('支') || str.includes('出') || str.includes('借') || str === 'out' || str === 'debit') return 'out'
  return amount >= 0 ? 'in' : 'out'
}

function rowsToTransactions(rows: unknown[][], sourcePlatform: string): RawTx[] {
  if (rows.length < 2) return []

  let headerIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] as unknown[]
    const joined = row.map(String).join('')
    if (DATE_KEYS.some((k) => joined.includes(k)) || AMOUNT_KEYS.some((k) => joined.includes(k))) {
      headerIdx = i
      break
    }
  }

  const headers = (rows[headerIdx] as unknown[]).map(String)
  const dateCol = findCol(headers, DATE_KEYS)
  const cpCol = findCol(headers, CP_KEYS)
  const cpAccCol = findCol(headers, CP_ACC_KEYS)
  const summaryCol = findCol(headers, SUMMARY_KEYS)
  const amountCol = findCol(headers, AMOUNT_KEYS)
  const dirCol = findCol(headers, DIR_KEYS)
  const balanceCol = findCol(headers, BALANCE_KEYS)

  const txs: RawTx[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every((c) => !c)) continue

    const amount = amountCol >= 0 ? parseAmount(row[amountCol]) : 0
    if (amount === 0) continue

    txs.push({
      id: uuidv4(),
      txDate: dateCol >= 0 ? parseDate(row[dateCol]) : new Date().toISOString(),
      counterparty: cpCol >= 0 ? String(row[cpCol] || '未知') : '未知',
      counterpartyAccount: cpAccCol >= 0 ? String(row[cpAccCol] || '') : undefined,
      summary: summaryCol >= 0 ? String(row[summaryCol] || '') : '',
      amount,
      direction: dirCol >= 0 ? parseDirection(row[dirCol], amount) : 'out',
      balance: balanceCol >= 0 ? parseAmount(row[balanceCol]) : undefined,
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
    const { base64, filename, sourcePlatform = '其他' } = JSON.parse(event.body || '{}')
    if (!base64) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少文件数据' }) }
    }

    const buffer = Buffer.from(base64, 'base64')
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheets = wb.SheetNames
    let allTxs: RawTx[] = []

    for (const sheet of sheets) {
      const ws = wb.Sheets[sheet]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
      allTxs = allTxs.concat(rowsToTransactions(rows, sourcePlatform))
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ transactions: allTxs, sheets }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Excel 解析失败' }),
    }
  }
}
