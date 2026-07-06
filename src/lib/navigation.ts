import type { AppState } from '../types'

type AppDispatch = (action: {
  type: 'SET_STEP'
  step: 1 | 2 | 3
} | {
  type: 'SET_STEP1_PHASE'
  phase: 'upload' | 'workspace'
} | {
  type: 'SET_ACTIVE_OCR_FILE'
  fileId: string | undefined
}) => void

/** 返回项目首页（文件列表） */
export function goProjectHome(dispatch: AppDispatch) {
  dispatch({ type: 'SET_STEP', step: 1 })
  dispatch({ type: 'SET_STEP1_PHASE', phase: 'upload' })
  dispatch({ type: 'SET_ACTIVE_OCR_FILE', fileId: undefined })
}

export function navigateToStep(dispatch: AppDispatch, step: 1 | 2 | 3) {
  dispatch({ type: 'SET_STEP', step })
  if (step === 1) {
    dispatch({ type: 'SET_STEP1_PHASE', phase: 'upload' })
    dispatch({ type: 'SET_ACTIVE_OCR_FILE', fileId: undefined })
  }
}

export function isProjectHome(state: AppState): boolean {
  return state.currentStep === 1 && state.step1Phase === 'upload'
}
