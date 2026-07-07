import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateScenarioReport, type TxInput } from './reportLogic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startedAt = Date.now()
  let jobId: string | undefined

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siliconflowKey = Deno.env.get('SILICONFLOW_API_KEY') || ''

    if (!siliconflowKey) {
      console.warn('[start-report-job] SILICONFLOW_API_KEY 未配置，将使用 fallback 报告')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '登录无效，请重新登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      projectId,
      scenario = 'general',
      scopeSnapshot = {},
      transactions = [],
      subjects = [],
    } = body as {
      projectId?: string
      scenario?: string
      scopeSnapshot?: Record<string, unknown>
      transactions?: TxInput[]
      subjects?: { name: string; accounts?: string[] }[]
    }

    if (!transactions.length) {
      return new Response(JSON.stringify({ error: '缺少交易数据' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[start-report-job] create', {
      userId: user.id,
      scenario,
      txCount: transactions.length,
    })

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: job, error: insertError } = await admin
      .from('report_jobs')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        scenario,
        status: 'running',
        progress: 20,
        scope_snapshot: scopeSnapshot,
        payload: { transactions, subjects },
      })
      .select('id, status')
      .single()

    if (insertError || !job) {
      console.error('[start-report-job] insert failed', insertError)
      return new Response(JSON.stringify({ error: insertError?.message || '创建任务失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    jobId = job.id
    console.log('[start-report-job] LLM start', { jobId, elapsedMs: Date.now() - startedAt })

    const result = await generateScenarioReport(
      siliconflowKey,
      scenario,
      transactions,
      subjects.map((s) => ({ name: s.name })),
    )

    console.log('[start-report-job] LLM done', { jobId, elapsedMs: Date.now() - startedAt })

    await admin
      .from('report_jobs')
      .update({ status: 'done', progress: 100, result, error: null })
      .eq('id', job.id)

    console.log('[start-report-job] complete', { jobId, elapsedMs: Date.now() - startedAt })

    return new Response(
      JSON.stringify({ jobId: job.id, status: 'done', result }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器错误'
    console.error('[start-report-job] error', { jobId, message, elapsedMs: Date.now() - startedAt })

    if (jobId) {
      try {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        await admin
          .from('report_jobs')
          .update({ status: 'error', progress: 100, error: message })
          .eq('id', jobId)
      } catch {
        // ignore secondary failure
      }
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
