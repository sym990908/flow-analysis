import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { exportReportExcel, exportReportPdf, exportToExcel } from '../lib/exportUtils'
import type { ScenarioReport, Transaction } from '../types'

interface Props {
  report?: ScenarioReport
  transactions: Transaction[]
}

export function ExportPanel({ report, transactions }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">导出</h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => exportToExcel(transactions)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          <FileSpreadsheet size={16} className="text-green-600" />
          导出流水 Excel
        </button>
        {report && (
          <>
            <button
              onClick={() => exportReportPdf(report, transactions)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              <FileText size={16} className="text-red-600" />
              导出报告 PDF
            </button>
            <button
              onClick={() => exportReportExcel(report, transactions)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              <Download size={16} />
              导出完整报告 Excel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
