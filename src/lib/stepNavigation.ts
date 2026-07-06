import type { AppState } from '../types'
import { getAnalyzableFiles } from './analysisScope'

export interface StepAccess {
  step1: boolean
  step2: boolean
  step3: boolean
}

export interface StepStats {
  fileCount: number
  transactionCount: number
  reportCount: number
}

export function getStepAccess(state: AppState): StepAccess {
  const hasTransactions = state.transactions.length > 0
  const hasAnalyzable = getAnalyzableFiles(state.files).length > 0
  return {
    step1: true,
    step2: hasTransactions || hasAnalyzable,
    step3: hasTransactions,
  }
}

export function getStepStats(state: AppState): StepStats {
  return {
    fileCount: state.files.length,
    transactionCount: state.transactions.length,
    reportCount: state.reports.length,
  }
}

export function stepBlockedReason(state: AppState, step: 1 | 2 | 3): string | null {
  const access = getStepAccess(state)
  if (step === 1) return null
  if (step === 2 && !access.step2) return '请先导入并完成至少一个文件的流水解析'
  if (step === 3 && !access.step3) return '请先完成结构化分析（需有流水数据）'
  return null
}
