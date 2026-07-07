export type ScenarioType = 'marriage' | 'lending' | 'labor' | 'partnership' | 'general'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface Transaction {
  id: string
  fileId?: string
  txDate: string
  counterparty: string
  counterpartyAccount?: string
  summary: string
  amount: number
  direction: 'in' | 'out'
  balance?: number
  sourcePlatform: string
  isDuplicate: boolean
  isRisk: boolean
  riskTags: string[]
  riskLevel: RiskLevel
  riskReasons: string[]
  scenarioTags: string[]
  rawData?: Record<string, unknown>
}

export interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  sourcePlatform?: string
  status: 'pending' | 'processing' | 'done' | 'error' | 'ocr_review' | 'parsed'
  error?: string
  transactionCount?: number
  needsOcrReview?: boolean
}

export interface Subject {
  id: string
  name: string
  accounts: string[]
  notes?: string
  isTracked: boolean
}

export interface FilterCriteria {
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
  counterparty?: string
  direction?: 'in' | 'out' | 'all'
  riskOnly?: boolean
  sourcePlatform?: string
  keyword?: string
}

export interface RiskRule {
  id: string
  name: string
  enabled: boolean
  description: string
}

export interface ScenarioReport {
  id: string
  scenario: ScenarioType
  title: string
  summary: string
  keyFindings: string[]
  keyTransactions: Transaction[]
  riskAlerts: string[]
  timeline: { date: string; event: string; amount?: number }[]
  recommendations: string[]
  generatedAt: string
  /** 纳入报告的文件名 */
  analyzedFileNames?: string[]
}

/** 报告生成时的流水范围快照（支持同项目多份报告） */
export interface ReportScopeSnapshot {
  mode: AnalysisScopeMode
  selectedFileIds: string[]
  fileLabels: string[]
  txCount: number
}

export type ScenarioReportRecord = ScenarioReport & {
  scopeSnapshot: ReportScopeSnapshot
}

export interface ReportJob {
  id: string
  /** Supabase 异步任务 ID（配置 Supabase 时使用） */
  remoteJobId?: string
  scenario: ScenarioType
  status: 'running' | 'done' | 'error'
  progress?: number
  error?: string
  reportId?: string
  scopeSnapshot: ReportScopeSnapshot
  startedAt: string
}

import type { OcrDocument } from './ocr'

export type Step1Phase = 'upload' | 'workspace'

export interface ParseJob {
  fileId: string
  status: 'running' | 'done' | 'error'
  error?: string
  transactionCount?: number
}

/** 结构化分析 / 场景报告的数据范围（OCR 仍按单文件管理） */
export type AnalysisScopeMode = 'all' | 'selected'

export interface AnalysisScope {
  /** all=整个项目已解析流水；selected=仅 selectedFileIds */
  mode: AnalysisScopeMode
  selectedFileIds: string[]
}

export interface AppState {
  projectId: string
  projectName: string
  currentStep: 1 | 2 | 3
  step1Phase: Step1Phase
  scenario: ScenarioType
  files: UploadedFile[]
  transactions: Transaction[]
  subjects: Subject[]
  filters: FilterCriteria
  riskRules: RiskRule[]
  /** 当前查看的报告（与 activeReportId 同步） */
  report?: ScenarioReportRecord
  /** 本项目全部场景报告记录 */
  reports: ScenarioReportRecord[]
  activeReportId?: string
  reportJob?: ReportJob
  ocrDocuments: OcrDocument[]
  activeOcrFileId?: string
  parseJob?: ParseJob
  /** Step2/Step3 共用：分析哪些文件的流水 */
  analysisScope: AnalysisScope
}

export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  marriage: '婚姻家事',
  lending: '民间借贷',
  labor: '劳动争议',
  partnership: '合伙纠纷',
  general: '通用分析',
}

export const SCENARIO_DESCRIPTIONS: Record<ScenarioType, string> = {
  marriage: '自动找出非家庭支出、隐匿收入',
  lending: '自动串联借-还-转时间线，理清欠款余额',
  labor: '自动标注工资、补贴、扣款',
  partnership: '自动识别异常资金往来与潜在风险点',
  general: '全面资金往来分析与异常识别',
}

export const SOURCE_PLATFORMS = [
  '工商银行', '建设银行', '农业银行', '中国银行', '交通银行',
  '招商银行', '浦发银行', '民生银行', '兴业银行', '中信银行',
  '支付宝', '微信支付', '其他',
]
