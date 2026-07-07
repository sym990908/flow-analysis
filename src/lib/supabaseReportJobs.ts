import { getSupabase, getSupabaseFunctionsUrl, isSupabaseConfigured } from './supabase'
import type { ReportScopeSnapshot, ScenarioType, Subject, Transaction } from '../types'
import type { LlmReportPayload } from './reportJobTypes'

export interface RemoteReportJobRow {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  result: LlmReportPayload | null
  error: string | null
}

export async function createRemoteReportJob(params: {
  projectId: string
  scenario: ScenarioType
  scopeSnapshot: ReportScopeSnapshot
  transactions: Transaction[]
  subjects: Pick<Subject, 'name' | 'accounts'>[]
}): Promise<{ jobId: string }> {
  const supabase = getSupabase()
  const functionsUrl = getSupabaseFunctionsUrl()
  if (!supabase || !functionsUrl) {
    throw new Error('Supabase 未配置')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('请先登录')

  const res = await fetch(`${functionsUrl}/start-report-job`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: params.projectId,
      scenario: params.scenario,
      scopeSnapshot: params.scopeSnapshot,
      transactions: params.transactions.map((t) => ({
        id: t.id,
        txDate: t.txDate,
        counterparty: t.counterparty,
        summary: t.summary,
        amount: t.amount,
        direction: t.direction,
        isRisk: t.isRisk,
        riskTags: t.riskTags,
      })),
      subjects: params.subjects,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `创建报告任务失败 (${res.status})`)
  }
  return { jobId: data.jobId as string }
}

export async function fetchRemoteReportJob(jobId: string): Promise<RemoteReportJobRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('report_jobs')
    .select('id, status, progress, result, error')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as RemoteReportJobRow | null
}

export function shouldUseRemoteReportJobs(): boolean {
  return isSupabaseConfigured
}

export async function pollRemoteReportJob(
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<RemoteReportJobRow> {
  const intervalMs = options?.intervalMs ?? 3000
  const timeoutMs = options?.timeoutMs ?? 180_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const row = await fetchRemoteReportJob(jobId)
    if (!row) throw new Error('报告任务不存在')
    if (row.status === 'done') return row
    if (row.status === 'error') throw new Error(row.error || '报告生成失败')
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error('报告生成超时，请稍后在报告历史中查看')
}
