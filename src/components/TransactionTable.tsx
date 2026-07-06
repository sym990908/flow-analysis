import { useMemo } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { Transaction } from '../types'

interface Props {
  transactions: Transaction[]
  onSelect?: (tx: Transaction) => void
  compact?: boolean
  showFileColumn?: boolean
  fileNameById?: Map<string, string>
}

export function TransactionTable({
  transactions,
  onSelect,
  compact,
  showFileColumn,
  fileNameById,
}: Props) {
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => b.txDate.localeCompare(a.txDate)),
    [transactions],
  )

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-500">
        暂无交易数据
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2.5">日期</th>
            <th className="px-3 py-2.5">对方</th>
            {!compact && <th className="px-3 py-2.5">摘要</th>}
            <th className="px-3 py-2.5 text-right">金额</th>
            {showFileColumn && <th className="px-3 py-2.5">流水文件</th>}
            <th className="px-3 py-2.5">来源</th>
            <th className="px-3 py-2.5">标记</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((tx) => (
            <tr
              key={tx.id}
              className={`hover:bg-slate-50 ${tx.isRisk ? 'bg-red-50/50' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
              onClick={() => onSelect?.(tx)}
            >
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                {tx.txDate.slice(0, 10)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2 font-medium text-slate-800">
                {tx.counterparty}
              </td>
              {!compact && (
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">{tx.summary}</td>
              )}
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                <span className={`inline-flex items-center gap-1 ${tx.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.direction === 'in' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                  ¥{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </td>
              {showFileColumn && (
                <td className="max-w-[100px] truncate px-3 py-2 text-xs text-slate-500" title={tx.fileId ? fileNameById?.get(tx.fileId) : undefined}>
                  {tx.fileId ? fileNameById?.get(tx.fileId) ?? '—' : '—'}
                </td>
              )}
              <td className="px-3 py-2 text-xs text-slate-500">{tx.sourcePlatform}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {tx.isRisk && tx.riskTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                      <AlertTriangle size={10} /> {tag}
                    </span>
                  ))}
                  {tx.scenarioTags.map((tag) => (
                    <span key={tag} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">{tag}</span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
