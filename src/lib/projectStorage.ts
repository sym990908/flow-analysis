import type { AppState, ScenarioReportRecord } from '../types'
import type { OcrDocument } from '../types/ocr'

const STORAGE_KEY = 'flow-analysis:v1'
const CURRENT_ID_KEY = 'flow-analysis:currentProjectId'

export interface ProjectSummary {
  projectId: string
  projectName: string
  currentStep: 1 | 2 | 3
  fileCount: number
  transactionCount: number
  reportCount: number
  updatedAt: string
}

export interface PersistedProject {
  projectId: string
  projectName: string
  currentStep: 1 | 2 | 3
  step1Phase: AppState['step1Phase']
  scenario: AppState['scenario']
  files: AppState['files']
  transactions: AppState['transactions']
  subjects: AppState['subjects']
  filters: AppState['filters']
  riskRules: AppState['riskRules']
  reports: ScenarioReportRecord[]
  activeReportId?: string
  analysisScope: AppState['analysisScope']
  /** OCR 元数据（不含 blob / 大块 blocks，刷新后需重新 OCR 文件） */
  ocrMeta: { fileId: string; fileName: string; totalPages: number; status: string }[]
  updatedAt: string
}

interface StorageRoot {
  projects: Record<string, PersistedProject>
}

function readRoot(): StorageRoot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { projects: {} }
    return JSON.parse(raw) as StorageRoot
  } catch {
    return { projects: {} }
  }
}

function writeRoot(root: StorageRoot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
}

function stripOcrMeta(docs: OcrDocument[]) {
  return docs.map((d) => ({
    fileId: d.fileId,
    fileName: d.fileName,
    totalPages: d.totalPages,
    status: d.pages.every((p) => p.status === 'done') ? 'done' : 'partial',
  }))
}

export function snapshotFromState(state: AppState): PersistedProject {
  return {
    projectId: state.projectId,
    projectName: state.projectName,
    currentStep: state.currentStep,
    step1Phase: state.step1Phase,
    scenario: state.scenario,
    files: state.files,
    transactions: state.transactions,
    subjects: state.subjects,
    filters: state.filters,
    riskRules: state.riskRules,
    reports: state.reports,
    activeReportId: state.activeReportId,
    analysisScope: state.analysisScope,
    ocrMeta: stripOcrMeta(state.ocrDocuments),
    updatedAt: new Date().toISOString(),
  }
}

export function stateFromSnapshot(snapshot: PersistedProject): AppState {
  const activeReport = snapshot.reports.find((r) => r.id === snapshot.activeReportId)
    ?? snapshot.reports[0]
  return {
    projectId: snapshot.projectId,
    projectName: snapshot.projectName,
    currentStep: snapshot.currentStep,
    step1Phase: snapshot.step1Phase === 'workspace' ? 'upload' : snapshot.step1Phase,
    scenario: snapshot.scenario,
    files: snapshot.files,
    transactions: snapshot.transactions,
    subjects: snapshot.subjects,
    filters: snapshot.filters,
    riskRules: snapshot.riskRules,
    reports: snapshot.reports,
    activeReportId: activeReport?.id,
    report: activeReport,
    analysisScope: snapshot.analysisScope,
    ocrDocuments: [],
    parseJob: undefined,
    reportJob: undefined,
  }
}

export function saveProjectSnapshot(state: AppState): void {
  const root = readRoot()
  const snapshot = snapshotFromState(state)
  root.projects[state.projectId] = snapshot
  writeRoot(root)
  localStorage.setItem(CURRENT_ID_KEY, state.projectId)
}

export function listProjectSummaries(): ProjectSummary[] {
  const root = readRoot()
  return Object.values(root.projects)
    .map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      currentStep: p.currentStep,
      fileCount: p.files.length,
      transactionCount: p.transactions.length,
      reportCount: p.reports.length,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadProject(projectId: string): PersistedProject | null {
  return readRoot().projects[projectId] ?? null
}

export function loadCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_ID_KEY)
}

export function deleteProject(projectId: string): void {
  const root = readRoot()
  delete root.projects[projectId]
  writeRoot(root)
  if (localStorage.getItem(CURRENT_ID_KEY) === projectId) {
    localStorage.removeItem(CURRENT_ID_KEY)
  }
}

export function hydrateInitialState(fallback: AppState): AppState {
  const currentId = loadCurrentProjectId()
  if (!currentId) return fallback
  const snapshot = loadProject(currentId)
  if (!snapshot) return fallback
  return stateFromSnapshot(snapshot)
}
