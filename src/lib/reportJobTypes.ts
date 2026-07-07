export interface LlmReportPayload {
  title: string
  summary: string
  keyFindings: string[]
  riskAlerts: string[]
  timeline: { date: string; event: string; amount?: number }[]
  recommendations: string[]
  keyTransactionIds: string[]
}
