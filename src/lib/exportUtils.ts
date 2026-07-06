import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { ScenarioReport, Transaction } from '../types'
import { SCENARIO_LABELS } from '../types'

export function exportToExcel(transactions: Transaction[], filename = 'flow-analysis.xlsx') {
  const rows = transactions.map((tx) => ({
    交易时间: tx.txDate,
    对方户名: tx.counterparty,
    对方账号: tx.counterpartyAccount || '',
    摘要: tx.summary,
    金额: tx.amount,
    方向: tx.direction === 'in' ? '收入' : '支出',
    余额: tx.balance ?? '',
    来源: tx.sourcePlatform,
    风险标记: tx.isRisk ? tx.riskTags.join(',') : '',
    风险原因: tx.riskReasons.join(';'),
    场景标签: tx.scenarioTags.join(','),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '流水明细')
  XLSX.writeFile(wb, filename)
}

export function exportReportPdf(report: ScenarioReport, transactions: Transaction[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const scenarioLabel = SCENARIO_LABELS[report.scenario]

  doc.setFontSize(18)
  doc.text('流水分析报告', 14, 20)
  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(`场景：${scenarioLabel}  |  生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}`, 14, 28)

  doc.setFontSize(13)
  doc.setTextColor(0)
  doc.text('分析摘要', 14, 40)
  doc.setFontSize(10)
  const summaryLines = doc.splitTextToSize(report.summary, 180)
  doc.text(summaryLines, 14, 48)

  let y = 48 + summaryLines.length * 5 + 8

  doc.setFontSize(13)
  doc.text('关键发现', 14, y)
  y += 6
  doc.setFontSize(10)
  report.keyFindings.forEach((f, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${f}`, 180)
    doc.text(lines, 14, y)
    y += lines.length * 5
  })

  y += 6
  doc.setFontSize(13)
  doc.text('风险预警', 14, y)
  y += 6
  doc.setFontSize(10)
  report.riskAlerts.forEach((a, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${a}`, 180)
    doc.text(lines, 14, y)
    y += lines.length * 5
  })

  doc.addPage()
  doc.setFontSize(13)
  doc.text('重点交易清单', 14, 20)

  const keyTxs = report.keyTransactions.length > 0 ? report.keyTransactions : transactions.filter((t) => t.isRisk).slice(0, 30)

  autoTable(doc, {
    startY: 26,
    head: [['日期', '对方', '摘要', '金额', '方向', '风险']],
    body: keyTxs.map((tx) => [
      tx.txDate.slice(0, 10),
      tx.counterparty.slice(0, 12),
      tx.summary.slice(0, 20),
      tx.amount.toFixed(2),
      tx.direction === 'in' ? '收入' : '支出',
      tx.riskTags.join(',') || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
  })

  doc.save(`${scenarioLabel}-分析报告.pdf`)
}

export function exportReportExcel(report: ScenarioReport, transactions: Transaction[]) {
  const wb = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.json_to_sheet([
    { 项目: '场景', 内容: SCENARIO_LABELS[report.scenario] },
    { 项目: '摘要', 内容: report.summary },
    ...report.keyFindings.map((f, i) => ({ 项目: `关键发现${i + 1}`, 内容: f })),
    ...report.riskAlerts.map((a, i) => ({ 项目: `风险预警${i + 1}`, 内容: a })),
    ...report.recommendations.map((r, i) => ({ 项目: `建议${i + 1}`, 内容: r })),
  ])
  XLSX.utils.book_append_sheet(wb, summarySheet, '分析报告')

  const txSheet = XLSX.utils.json_to_sheet(
    transactions.map((tx) => ({
      交易时间: tx.txDate,
      对方户名: tx.counterparty,
      摘要: tx.summary,
      金额: tx.amount,
      方向: tx.direction === 'in' ? '收入' : '支出',
      风险: tx.isRisk ? tx.riskTags.join(',') : '',
    })),
  )
  XLSX.utils.book_append_sheet(wb, txSheet, '流水明细')

  XLSX.writeFile(wb, `${SCENARIO_LABELS[report.scenario]}-分析报告.xlsx`)
}
