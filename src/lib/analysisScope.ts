import type { AnalysisScope, Transaction, UploadedFile } from '../types'

/** 已解析、可参与结构化/场景分析的文件 */
export function getAnalyzableFiles(files: UploadedFile[]): UploadedFile[] {
  return files.filter(
    (f) =>
      (f.status === 'done' || f.status === 'parsed') &&
      (f.transactionCount ?? 0) > 0,
  )
}

export function countTransactionsByFile(
  transactions: Transaction[],
  fileId: string,
): number {
  return transactions.filter((t) => t.fileId === fileId).length
}

export function getEffectiveFileIds(
  scope: AnalysisScope,
  files: UploadedFile[],
): string[] {
  const analyzable = getAnalyzableFiles(files)
  if (scope.mode === 'all') {
    return analyzable.map((f) => f.id)
  }
  return scope.selectedFileIds.filter((id) => analyzable.some((f) => f.id === id))
}

export function getScopedTransactions(
  transactions: Transaction[],
  scope: AnalysisScope,
  files: UploadedFile[],
): Transaction[] {
  const fileIds = new Set(getEffectiveFileIds(scope, files))
  if (fileIds.size === 0) return []

  return transactions.filter((t) => {
    if (!t.fileId) return scope.mode === 'all'
    return fileIds.has(t.fileId)
  })
}

export function getScopeSummary(
  scope: AnalysisScope,
  files: UploadedFile[],
  transactions: Transaction[],
): { fileCount: number; txCount: number; labels: string[] } {
  const effectiveIds = getEffectiveFileIds(scope, files)
  const scoped = getScopedTransactions(transactions, scope, files)
  const labels = effectiveIds.map((id) => files.find((f) => f.id === id)?.name ?? id)
  return { fileCount: effectiveIds.length, txCount: scoped.length, labels }
}

export function defaultAnalysisScope(files: UploadedFile[]): AnalysisScope {
  return {
    mode: 'all',
    selectedFileIds: getAnalyzableFiles(files).map((f) => f.id),
  }
}
