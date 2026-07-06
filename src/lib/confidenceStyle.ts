export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ConfidenceColors {
  level: ConfidenceLevel
  border: string
  fill: string
  text: string
  label: string
}

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.95) return 'high'
  if (score >= 0.8) return 'medium'
  return 'low'
}

export function getConfidenceStyle(score: number): ConfidenceColors {
  const level = getConfidenceLevel(score)
  switch (level) {
    case 'high':
      return { level, border: '#22c55e', fill: 'rgba(34,197,94,0.12)', text: '#166534', label: '高' }
    case 'medium':
      return { level, border: '#eab308', fill: 'rgba(234,179,8,0.18)', text: '#854d0e', label: '中' }
    default:
      return { level, border: '#ef4444', fill: 'rgba(239,68,68,0.15)', text: '#991b1b', label: '低' }
  }
}

/** Glide grid cell background (RGBA string) */
export function getConfidenceCellBg(score: number | undefined): string | undefined {
  if (score === undefined) return undefined
  const level = getConfidenceLevel(score)
  if (level === 'high') return 'rgba(34,197,94,0.15)'
  if (level === 'medium') return 'rgba(234,179,8,0.2)'
  return 'rgba(239,68,68,0.2)'
}

export const CONFIDENCE_LEGEND = [
  { level: 'high' as const, label: '高 ≥95%', color: '#22c55e' },
  { level: 'medium' as const, label: '中 80-95%', color: '#eab308' },
  { level: 'low' as const, label: '低 <80%', color: '#ef4444' },
]
