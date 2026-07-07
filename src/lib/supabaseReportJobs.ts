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

export interface CreateRemoteReportJobResult {
  jobId: string
  /** Edge Function 同步完成时直接返回结果，无需轮询 */
  result?: LlmReportPayload
}

export async function createRemoteReportJob(params: {
  projectId: string
  scenario: ScenarioType
  scopeSnapshot: ReportScopeSnapshot
  transactions: Transaction[]
  subjects: Pick<Subject, 'name' | 'accounts'>[]
}): Promise<CreateRemoteReportJobResult> {
  const supabase = getSupabase()
  const functionsUrl = getSupabaseFunctionsUrl()
  if (!supabase || !functionsUrl) {
    throw new Error('Supabase 未配置')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('请先登录')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 600_000)

  let res: Response
  try {
    res = await fetch(`${functionsUrl}/start-report-job`, {
      method: 'POST',
      signal: controller.signal,
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
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('报告请求超时（>10 分钟），请在 Supabase report_jobs 表查看任务状态')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `创建报告任务失败 (${res.status})`)
  }

  return {
    jobId: data.jobId as string,
    result: data.result as LlmReportPayload | undefined,
  }
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
  options?: {
    intervalMs?: number
    timeoutMs?: number
    onProgress?: (progress: number) => void
  },
): Promise<RemoteReportJobRow> {
  const intervalMs = options?.intervalMs ?? 3000
  const timeoutMs = options?.timeoutMs ?? 600_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const row = await fetchRemoteReportJob(jobId)
    if (!row) throw new Error('报告任务不存在')
    if (row.progress > 0) options?.onProgress?.(row.progress)
    if (row.status === 'done') return row
    if (row.status === 'error') throw new Error(row.error || '报告生成失败')
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error('报告生成超时。任务可能仍在后台运行，请刷新页面后查看「已生成报告」或 Supabase report_jobs 表')
}
