import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type {
  AnalysisScope,
  AppState,
  FilterCriteria,
  ParseJob,
  ReportJob,
  RiskRule,
  ScenarioReportRecord,
  ScenarioType,
  Step1Phase,
  Subject,
  Transaction,
  UploadedFile,
} from '../types'
import type { OcrBlock, OcrDocument, OcrPage } from '../types/ocr'
import type { StatementTable } from '../types/statementTable'
import { DEFAULT_RISK_RULES } from '../lib/riskEngine'
import { removeCachedFile } from '../lib/fileCache'
import { clearPdfCache } from '../lib/pdfUtils'
import { hydrateInitialState, stateFromSnapshot } from '../lib/projectStorage'
import type { PersistedProject } from '../lib/projectStorage'
import type { OcrRotation } from '../types/ocr'

type Action =
  | { type: 'SET_STEP'; step: 1 | 2 | 3 }
  | { type: 'SET_STEP1_PHASE'; phase: Step1Phase }
  | { type: 'SET_SCENARIO'; scenario: ScenarioType }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'ADD_FILE'; file: UploadedFile }
  | { type: 'UPDATE_FILE'; id: string; updates: Partial<UploadedFile> }
  | { type: 'SET_TRANSACTIONS'; transactions: Transaction[] }
  | { type: 'ADD_TRANSACTIONS'; transactions: Transaction[] }
  | { type: 'SET_FILTERS'; filters: FilterCriteria }
  | { type: 'SET_RISK_RULES'; rules: RiskRule[] }
  | { type: 'ADD_SUBJECT'; subject: Subject }
  | { type: 'UPDATE_SUBJECT'; id: string; updates: Partial<Subject> }
  | { type: 'REMOVE_SUBJECT'; id: string }
  | { type: 'SET_REPORT'; report: ScenarioReportRecord }
  | { type: 'ADD_REPORT'; report: ScenarioReportRecord }
  | { type: 'SELECT_REPORT'; reportId: string }
  | { type: 'START_REPORT_JOB'; job: ReportJob }
  | { type: 'UPDATE_REPORT_JOB'; updates: Partial<Pick<ReportJob, 'progress' | 'remoteJobId'>> }
  | { type: 'CLEAR_STUCK_REPORT_JOB' }
  | { type: 'COMPLETE_REPORT_JOB'; reportId: string }
  | { type: 'FAIL_REPORT_JOB'; error: string }
  | { type: 'CLEAR_REPORT_JOB' }
  | { type: 'LOAD_PROJECT'; snapshot: PersistedProject }
  | { type: 'SET_OCR_DOCUMENT'; document: OcrDocument }
  | { type: 'UPDATE_OCR_DOCUMENT'; fileId: string; updates: Partial<OcrDocument> }
  | { type: 'UPDATE_OCR_PAGE'; fileId: string; pageIndex: number; updates: Partial<OcrPage> }
  | { type: 'UPDATE_OCR_BLOCK'; fileId: string; pageIndex: number; blockId: string; editedText: string }
  | { type: 'SET_ACTIVE_OCR_FILE'; fileId: string | undefined }
  | { type: 'SET_STATEMENT_TABLE'; fileId: string; table: StatementTable }
  | { type: 'START_PARSE_JOB'; fileId: string }
  | { type: 'COMPLETE_PARSE_JOB'; fileId: string; transactionCount: number }
  | { type: 'FAIL_PARSE_JOB'; fileId: string; error: string }
  | { type: 'CLEAR_PARSE_JOB' }
  | { type: 'SET_ANALYSIS_SCOPE'; scope: AnalysisScope }
  | { type: 'REMOVE_FILE'; fileId: string }
  | { type: 'REMOVE_FILES'; fileIds: string[] }
  | { type: 'ROTATE_OCR_DOCUMENT'; fileId: string; delta?: 90 }
  | { type: 'RESET' }

const initialState: AppState = {
  projectId: uuidv4(),
  projectName: 'Flow Analysis',
  currentStep: 1,
  step1Phase: 'upload',
  scenario: 'general',
  files: [],
  transactions: [],
  subjects: [],
  filters: {},
  riskRules: DEFAULT_RISK_RULES,
  reports: [],
  ocrDocuments: [],
  analysisScope: { mode: 'all', selectedFileIds: [] },
}

function withActiveReport(
  reports: ScenarioReportRecord[],
  activeReportId?: string,
  fallback?: ScenarioReportRecord,
): { reports: ScenarioReportRecord[]; activeReportId?: string; report?: ScenarioReportRecord } {
  const active =
    reports.find((r) => r.id === activeReportId) ?? fallback ?? reports[0]
  return {
    reports,
    activeReportId: active?.id,
    report: active,
  }
}

function updateOcrDoc(
  docs: OcrDocument[],
  fileId: string,
  updater: (doc: OcrDocument) => OcrDocument,
): OcrDocument[] {
  return docs.map((d) => (d.fileId === fileId ? updater(d) : d))
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step }
    case 'SET_STEP1_PHASE':
      return { ...state, step1Phase: action.phase }
    case 'SET_SCENARIO':
      return { ...state, scenario: action.scenario }
    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.name }
    case 'ADD_FILE':
      return { ...state, files: [...state.files, action.file] }
    case 'UPDATE_FILE':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, ...action.updates } : f)),
        analysisScope:
          action.updates.status === 'done' || action.updates.status === 'parsed'
            ? {
                ...state.analysisScope,
                selectedFileIds: [...new Set([...state.analysisScope.selectedFileIds, action.id])],
              }
            : state.analysisScope,
      }
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.transactions }
    case 'ADD_TRANSACTIONS': {
      const addedIds = [
        ...new Set(
          action.transactions.map((t) => t.fileId).filter((id): id is string => !!id),
        ),
      ]
      return {
        ...state,
        transactions: [...state.transactions, ...action.transactions],
        analysisScope: {
          ...state.analysisScope,
          selectedFileIds: [...new Set([...state.analysisScope.selectedFileIds, ...addedIds])],
        },
      }
    }
    case 'SET_FILTERS':
      return { ...state, filters: action.filters }
    case 'SET_RISK_RULES':
      return { ...state, riskRules: action.rules }
    case 'ADD_SUBJECT':
      return { ...state, subjects: [...state.subjects, action.subject] }
    case 'UPDATE_SUBJECT':
      return {
        ...state,
        subjects: state.subjects.map((s) =>
          s.id === action.id ? { ...s, ...action.updates } : s,
        ),
      }
    case 'REMOVE_SUBJECT':
      return { ...state, subjects: state.subjects.filter((s) => s.id !== action.id) }
    case 'SET_REPORT':
    case 'ADD_REPORT': {
      const reports = [
        action.report,
        ...state.reports.filter((r) => r.id !== action.report.id),
      ]
      return { ...state, ...withActiveReport(reports, action.report.id) }
    }
    case 'SELECT_REPORT': {
      const report = state.reports.find((r) => r.id === action.reportId)
      if (!report) return state
      return { ...state, activeReportId: report.id, report }
    }
    case 'START_REPORT_JOB':
      return { ...state, reportJob: action.job }
    case 'UPDATE_REPORT_JOB':
      return {
        ...state,
        reportJob: state.reportJob
          ? { ...state.reportJob, ...action.updates }
          : undefined,
      }
    case 'COMPLETE_REPORT_JOB': {
      const report = state.reports.find((r) => r.id === action.reportId)
      return {
        ...state,
        reportJob: state.reportJob
          ? { ...state.reportJob, status: 'done', reportId: action.reportId }
          : undefined,
        activeReportId: report?.id ?? state.activeReportId,
        report: report ?? state.report,
      }
    }
    case 'FAIL_REPORT_JOB':
      return {
        ...state,
        reportJob: state.reportJob
          ? { ...state.reportJob, status: 'error', error: action.error }
          : undefined,
      }
    case 'CLEAR_REPORT_JOB':
      return { ...state, reportJob: undefined }
    case 'CLEAR_STUCK_REPORT_JOB':
      return { ...state, reportJob: undefined }
    case 'LOAD_PROJECT':
      return stateFromSnapshot(action.snapshot)
    case 'SET_OCR_DOCUMENT':
      return {
        ...state,
        ocrDocuments: [...state.ocrDocuments.filter((d) => d.fileId !== action.document.fileId), action.document],
        activeOcrFileId: action.document.fileId,
        step1Phase: 'workspace',
      }
    case 'UPDATE_OCR_DOCUMENT':
      return {
        ...state,
        ocrDocuments: updateOcrDoc(state.ocrDocuments, action.fileId, (d) => ({
          ...d,
          ...action.updates,
        })),
      }
    case 'UPDATE_OCR_PAGE':
      return {
        ...state,
        ocrDocuments: updateOcrDoc(state.ocrDocuments, action.fileId, (d) => ({
          ...d,
          pages: d.pages.map((p) =>
            p.pageIndex === action.pageIndex ? { ...p, ...action.updates } : p,
          ),
        })),
      }
    case 'UPDATE_OCR_BLOCK':
      return {
        ...state,
        ocrDocuments: updateOcrDoc(state.ocrDocuments, action.fileId, (d) => ({
          ...d,
          pages: d.pages.map((p) =>
            p.pageIndex === action.pageIndex
              ? {
                  ...p,
                  blocks: p.blocks.map((b: OcrBlock) =>
                    b.id === action.blockId ? { ...b, editedText: action.editedText } : b,
                  ),
                }
              : p,
          ),
        })),
      }
    case 'SET_ACTIVE_OCR_FILE':
      return { ...state, activeOcrFileId: action.fileId }
    case 'SET_STATEMENT_TABLE':
      return {
        ...state,
        ocrDocuments: updateOcrDoc(state.ocrDocuments, action.fileId, (d) => ({
          ...d,
          statementTable: action.table,
        })),
      }
    case 'START_PARSE_JOB':
      return {
        ...state,
        parseJob: { fileId: action.fileId, status: 'running' } satisfies ParseJob,
      }
    case 'COMPLETE_PARSE_JOB':
      return {
        ...state,
        parseJob: {
          fileId: action.fileId,
          status: 'done',
          transactionCount: action.transactionCount,
        } satisfies ParseJob,
      }
    case 'FAIL_PARSE_JOB':
      return {
        ...state,
        parseJob: {
          fileId: action.fileId,
          status: 'error',
          error: action.error,
        } satisfies ParseJob,
      }
    case 'CLEAR_PARSE_JOB':
      return { ...state, parseJob: undefined }
    case 'SET_ANALYSIS_SCOPE':
      return { ...state, analysisScope: action.scope }
    case 'REMOVE_FILE':
    case 'REMOVE_FILES': {
      const ids = action.type === 'REMOVE_FILE' ? [action.fileId] : action.fileIds
      const idSet = new Set(ids)
      for (const id of ids) {
        removeCachedFile(id)
        clearPdfCache(id)
      }
      return {
        ...state,
        files: state.files.filter((f) => !idSet.has(f.id)),
        transactions: state.transactions.filter((t) => !t.fileId || !idSet.has(t.fileId)),
        ocrDocuments: state.ocrDocuments.filter((d) => !idSet.has(d.fileId)),
        activeOcrFileId: state.activeOcrFileId && idSet.has(state.activeOcrFileId)
          ? undefined
          : state.activeOcrFileId,
        analysisScope: {
          ...state.analysisScope,
          selectedFileIds: state.analysisScope.selectedFileIds.filter((id) => !idSet.has(id)),
        },
        parseJob: state.parseJob && idSet.has(state.parseJob.fileId)
          ? undefined
          : state.parseJob,
      }
    }
    case 'ROTATE_OCR_DOCUMENT': {
      const delta = (action.delta ?? 90) as OcrRotation
      return {
        ...state,
        ocrDocuments: updateOcrDoc(state.ocrDocuments, action.fileId, (d) => ({
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            rotation: ((p.rotation + delta) % 360) as OcrRotation,
          })),
        })),
      }
    }
    case 'RESET':
      return {
        ...initialState,
        projectId: uuidv4(),
        analysisScope: { mode: 'all', selectedFileIds: [] },
      }
    default:
      return state
  }
}

const AppContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<Action>
} | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, hydrateInitialState)

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
