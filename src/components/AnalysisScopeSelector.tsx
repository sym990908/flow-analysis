import { useMemo } from 'react'
import { Files, FileText } from 'lucide-react'
import { useApp } from '../store/AppContext'
import {
  countTransactionsByFile,
  getAnalyzableFiles,
  getScopeSummary,
  getScopedTransactions,
} from '../lib/analysisScope'

interface Props {
  compact?: boolean
}

export function AnalysisScopeSelector({ compact }: Props) {
  const { state, dispatch } = useApp()
  const analyzable = useMemo(() => getAnalyzableFiles(state.files), [state.files])
  const scope = state.analysisScope
  const summary = useMemo(
    () => getScopeSummary(scope, state.files, state.transactions),
    [scope, state.files, state.transactions],
  )

  const setMode = (mode: 'all' | 'selected') => {
    dispatch({
      type: 'SET_ANALYSIS_SCOPE',
      scope: {
        mode,
        selectedFileIds:
          mode === 'all'
            ? analyzable.map((f) => f.id)
            : scope.selectedFileIds.length > 0
              ? scope.selectedFileIds
              : analyzable.map((f) => f.id),
      },
    })
  }

  const toggleFile = (fileId: string) => {
    const set = new Set(scope.selectedFileIds)
    if (set.has(fileId)) set.delete(fileId)
    else set.add(fileId)
    dispatch({
      type: 'SET_ANALYSIS_SCOPE',
      scope: { mode: 'selected', selectedFileIds: [...set] },
    })
  }

  const selectOnly = (fileId: string) => {
    dispatch({
      type: 'SET_ANALYSIS_SCOPE',
      scope: { mode: 'selected', selectedFileIds: [fileId] },
    })
  }

  if (analyzable.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        暂无已解析流水文件，请先在上传步骤完成 Excel 解析或 OCR 确认。
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Files size={16} className="text-blue-600" />
          分析范围
        </h3>
        <span className="text-xs text-slate-500">
          当前 {summary.fileCount} 个文件 · {summary.txCount} 笔
          {summary.fileCount > 1 ? '（可跨银行合并分析）' : ''}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('all')}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            scope.mode === 'all'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          整个项目（{analyzable.length} 个文件）
        </button>
        <button
          type="button"
          onClick={() => setMode('selected')}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            scope.mode === 'selected'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          选择文件
        </button>
        {scope.mode === 'selected' && analyzable.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'SET_ANALYSIS_SCOPE',
                  scope: { mode: 'selected', selectedFileIds: analyzable.map((f) => f.id) },
                })
              }
              className="text-xs text-blue-600 hover:underline"
            >
              全选
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'SET_ANALYSIS_SCOPE',
                  scope: { mode: 'selected', selectedFileIds: [] },
                })
              }
              className="text-xs text-slate-500 hover:underline"
            >
              清空
            </button>
          </>
        )}
      </div>

      {(scope.mode === 'selected' || !compact) && (
        <ul className={`space-y-1.5 ${compact && scope.mode === 'all' ? 'hidden' : ''}`}>
          {analyzable.map((f) => {
            const txCount = countTransactionsByFile(state.transactions, f.id)
            const checked =
              scope.mode === 'all' || scope.selectedFileIds.includes(f.id)
            return (
              <li
                key={f.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  checked ? 'bg-blue-50/80' : 'bg-slate-50'
                }`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={scope.mode === 'all'}
                    onChange={() => {
                      if (scope.mode !== 'selected') setMode('selected')
                      toggleFile(f.id)
                    }}
                    className="rounded"
                  />
                  <FileText size={14} className="shrink-0 text-slate-400" />
                  <span className="truncate text-slate-800">{f.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">({f.sourcePlatform})</span>
                </label>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-500">{txCount} 笔</span>
                  {scope.mode === 'selected' && analyzable.length > 1 && (
                    <button
                      type="button"
                      onClick={() => selectOnly(f.id)}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      仅分析此文件
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {scope.mode === 'selected' && scope.selectedFileIds.length === 0 && (
        <p className="mt-2 text-xs text-red-600">请至少选择一个文件</p>
      )}

      {scope.mode === 'all' && compact && summary.labels.length > 0 && (
        <p className="mt-2 truncate text-xs text-slate-500" title={summary.labels.join('、')}>
          包含：{summary.labels.join('、')}
        </p>
      )}
    </div>
  )
}

export function useScopedAnalysis() {
  const { state } = useApp()
  const scopedTransactions = useMemo(
    () => getScopedTransactions(state.transactions, state.analysisScope, state.files),
    [state.transactions, state.analysisScope, state.files],
  )
  const summary = useMemo(
    () => getScopeSummary(state.analysisScope, state.files, state.transactions),
    [state.analysisScope, state.files, state.transactions],
  )
  const isScopeValid =
    state.analysisScope.mode === 'all' ||
    state.analysisScope.selectedFileIds.length > 0

  const fileNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of state.files) map.set(f.id, f.name)
    return map
  }, [state.files])

  return {
    scopedTransactions,
    summary,
    isScopeValid,
    showFileColumn: summary.fileCount > 1,
    fileNameById,
    analysisScope: state.analysisScope,
  }
}
