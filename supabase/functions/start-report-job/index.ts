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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siliconflowKey = Deno.env.get('SILICONFLOW_API_KEY') || ''

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

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: job, error: insertError } = await admin
      .from('report_jobs')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        scenario,
        status: 'pending',
        progress: 5,
        scope_snapshot: scopeSnapshot,
        payload: { transactions, subjects },
      })
      .select('id, status')
      .single()

    if (insertError || !job) {
      return new Response(JSON.stringify({ error: insertError?.message || '创建任务失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const processJob = async () => {
      await admin.from('report_jobs').update({ status: 'running', progress: 20 }).eq('id', job.id)
      try {
        const result = await generateScenarioReport(
          siliconflowKey,
          scenario,
          transactions,
          subjects.map((s) => ({ name: s.name })),
        )
        await admin
          .from('report_jobs')
          .update({ status: 'done', progress: 100, result, error: null })
          .eq('id', job.id)
      } catch (err) {
        await admin
          .from('report_jobs')
          .update({
            status: 'error',
            progress: 100,
            error: err instanceof Error ? err.message : '报告生成失败',
          })
          .eq('id', job.id)
      }
    }

    // @ts-expect-error EdgeRuntime is injected by Supabase Edge Runtime
    EdgeRuntime.waitUntil(processJob())

    return new Response(JSON.stringify({ jobId: job.id, status: 'pending' }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : '服务器错误' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
