import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { getCounterpartyStats, getMonthlyStats } from '../lib/riskEngine'
import type { Transaction } from '../types'

export function FundFlowChart({ transactions }: { transactions: Transaction[] }) {
  const monthly = getMonthlyStats(transactions)
  const counterparty = getCounterpartyStats(transactions).slice(0, 8)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">月度收支趋势</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
            <Legend />
            <Line type="monotone" dataKey="in" name="收入" stroke="#16a34a" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="out" name="支出" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">往来对象 TOP8</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={counterparty} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
            <Bar dataKey="in" name="收入" fill="#16a34a" radius={[0, 2, 2, 0]} />
            <Bar dataKey="out" name="支出" fill="#dc2626" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
