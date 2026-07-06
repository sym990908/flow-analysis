import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { FileUpload } from '../components/FileUpload'
import { ProjectRecordsPanel } from '../components/ProjectRecordsPanel'
import { OcrWorkspace } from '../components/ocr/OcrWorkspace'
import { getAnalyzableFiles, countTransactionsByFile } from '../lib/analysisScope'
import {
  CheckCircle, FileIcon, Loader2, XCircle, Scan, Trash2, BarChart3,
} from 'lucide-react'

export function Step1Upload() {
  const { state, dispatch } = useApp()
  const analyzable = useMemo(() => getAnalyzableFiles(state.files), [state.files])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const activeDoc = state.ocrDocuments.find((d) => d.fileId === state.activeOcrFileId)

  const enterWorkspace = (fileId: string) => {
    dispatch({ type: 'SET_ACTIVE_OCR_FILE', fileId })
    dispatch({ type: 'SET_STEP1_PHASE', phase: 'workspace' })
  }

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  const selectAllAnalyzable = () => {
    setSelectedIds(new Set(analyzable.map((f) => f.id)))
  }

  const deleteFile = (fileId: string) => {
    if (!confirm('确定彻底删除该文件及其流水、OCR 数据？')) return
    dispatch({ type: 'REMOVE_FILE', fileId })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(fileId)
      return next
    })
  }

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个文件？`)) return
    dispatch({ type: 'REMOVE_FILES', fileIds: [...selectedIds] })
    setSelectedIds(new Set())
  }

  const analyzeSelected = () => {
    const ids = [...selectedIds].filter((id) => analyzable.some((f) => f.id === id))
    if (ids.length === 0) return
    dispatch({
      type: 'SET_ANALYSIS_SCOPE',
      scope: { mode: 'selected', selectedFileIds: ids },
    })
    dispatch({ type: 'SET_STEP', step: 2 })
  }

  const selectedTxCount = useMemo(() => {
    return [...selectedIds].reduce(
      (sum, id) => sum + countTransactionsByFile(state.transactions, id),
      0,
    )
  }, [selectedIds, state.transactions])

  if (state.step1Phase === 'workspace' && activeDoc) {
    return (
      <div className="mx-auto max-w-7xl">
        <OcrWorkspace document={activeDoc} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">项目首页 · 导入银行流水</h2>
        <p className="mt-2 text-slate-600">
          PDF/图片逐文件 OCR 校对；Excel 直接解析；可多选文件进入结构化分析
        </p>
      </div>

      <FileUpload />

      <ProjectRecordsPanel />

      {state.files.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              已上传文件 ({analyzable.length}/{state.files.length} 可分析)
            </h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={selectAllAnalyzable} className="text-blue-600 hover:underline">
                全选可分析
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-slate-500 hover:underline"
              >
                清空选择
              </button>
              {selectedIds.size > 0 && (
                <button type="button" onClick={deleteSelected} className="text-red-600 hover:underline">
                  删除选中
                </button>
              )}
            </div>
          </div>

          <ul className="space-y-2">
            {state.files.map((f) => {
              const hasOcrDoc = state.ocrDocuments.some((d) => d.fileId === f.id)
              const canAnalyze = analyzable.some((a) => a.id === f.id)
              const txCount = countTransactionsByFile(state.transactions, f.id)

              return (
                <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {canAnalyze && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(f.id)}
                          onChange={() => toggleSelect(f.id)}
                          className="rounded"
                        />
                      )}
                      <FileIcon size={16} className="shrink-0 text-slate-400" />
                      <span className="truncate text-sm text-slate-800">{f.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">({f.sourcePlatform})</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      {f.status === 'processing' && (
                        <Loader2 size={14} className="animate-spin text-blue-500" />
                      )}
                      {canAnalyze && (
                        <span className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle size={14} /> {f.transactionCount ?? txCount} 笔
                        </span>
                      )}
                      {hasOcrDoc && (
                        <button
                          onClick={() => enterWorkspace(f.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Scan size={14} /> OCR 编辑
                        </button>
                      )}
                      <button
                        onClick={() => deleteFile(f.id)}
                        className="flex items-center gap-1 text-xs text-red-600 hover:underline"
                      >
                        <Trash2 size={14} /> 删除
                      </button>
                      {f.status === 'error' && (
                        <span className="flex items-center gap-1 text-red-600 text-xs">
                          <XCircle size={14} /> {f.error}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {selectedIds.size > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={analyzeSelected}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <BarChart3 size={16} />
                分析选中文件 ({selectedIds.size} 个 · {selectedTxCount} 笔)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
