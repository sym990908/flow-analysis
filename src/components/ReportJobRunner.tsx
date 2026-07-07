import { useEffect, useRef } from 'react'
import { useApp } from '../store/AppContext'
import { buildScenarioReportRecord, prepareTransactionsForReport } from '../lib/buildScenarioReport'
import { getScopedTransactions } from '../lib/analysisScope'
import type { ReportJob } from '../types'

/** 后台执行场景报告生成（可离开 Step3 继续其他操作） */
export function ReportJobRunner() {
  const { state, dispatch } = useApp()
  const stateRef = useRef(state)
  stateRef.current = state

  /** 防止同一 job 重复启动；进度更新不再触发 effect 重跑 */
  const activeJobIdRef = useRef<string | null>(null)

  const jobId = state.reportJob?.id
  const jobStatus = state.reportJob?.status

  useEffect(() => {
    const job = state.reportJob
    if (!job || job.status !== 'running') {
      if (!job || job.status !== 'running') activeJobIdRef.current = null
      return
    }
    if (activeJobIdRef.current === job.id) return
    activeJobIdRef.current = job.id

    const jobSnapshot: ReportJob = { ...job }
    let cancelled = false

    ;(async () => {
      try {
        const s = stateRef.current
        const scope = {
          mode: jobSnapshot.scopeSnapshot.mode,
          selectedFileIds: jobSnapshot.scopeSnapshot.selectedFileIds,
        }
        const scoped = getScopedTransactions(s.transactions, scope, s.files)
        const processed = prepareTransactionsForReport(
          { ...s, scenario: jobSnapshot.scenario, analysisScope: scope },
          scoped,
        )
        const report = await buildScenarioReportRecord(
          { ...s, scenario: jobSnapshot.scenario, analysisScope: scope },
          processed,
          jobSnapshot,
          (progress) => {
            if (cancelled) return
            dispatch({ type: 'UPDATE_REPORT_JOB', updates: { progress } })
          },
          (remoteJobId) => {
            if (cancelled) return
            dispatch({ type: 'UPDATE_REPORT_JOB', updates: { remoteJobId, progress: 15 } })
          },
        )
        if (cancelled) return
        dispatch({ type: 'ADD_REPORT', report })
        dispatch({ type: 'COMPLETE_REPORT_JOB', reportId: report.id })
      } catch (err) {
        if (cancelled) return
        dispatch({
          type: 'FAIL_REPORT_JOB',
          error: err instanceof Error ? err.message : '报告生成失败',
        })
      } finally {
        if (activeJobIdRef.current === jobSnapshot.id) {
          activeJobIdRef.current = null
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // 仅 job 身份/状态变化时重启，progress / remoteJobId 更新不触发 cleanup
  }, [jobId, jobStatus, dispatch])

  return null
}
