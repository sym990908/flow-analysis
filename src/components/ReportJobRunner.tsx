import { useEffect, useRef } from 'react'
import { useApp } from '../store/AppContext'
import { buildScenarioReportRecord, prepareTransactionsForReport } from '../lib/buildScenarioReport'
import { getScopedTransactions } from '../lib/analysisScope'

/** 后台执行场景报告生成（可离开 Step3 继续其他操作） */
export function ReportJobRunner() {
  const { state, dispatch } = useApp()
  const runningIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const job = state.reportJob
    if (!job || job.status !== 'running') return
    if (runningIdRef.current === job.id) return
    runningIdRef.current = job.id

    let cancelled = false

    ;(async () => {
      try {
        const scope = {
          mode: job.scopeSnapshot.mode,
          selectedFileIds: job.scopeSnapshot.selectedFileIds,
        }
        const scoped = getScopedTransactions(state.transactions, scope, state.files)
        const processed = prepareTransactionsForReport(
          { ...state, scenario: job.scenario, analysisScope: scope },
          scoped,
        )
        const report = await buildScenarioReportRecord(
          { ...state, scenario: job.scenario, analysisScope: scope },
          processed,
          job,
          (progress) => {
            if (cancelled) return
            dispatch({
              type: 'UPDATE_REPORT_JOB',
              updates: { progress },
            })
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
        if (runningIdRef.current === job.id) runningIdRef.current = undefined
      }
    })()

    return () => {
      cancelled = true
    }
  }, [state.reportJob, state.transactions, state.riskRules, state.subjects, state.files, dispatch])

  return null
}
