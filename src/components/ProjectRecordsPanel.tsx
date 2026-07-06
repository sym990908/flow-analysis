import { format } from 'date-fns'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import {
  deleteProject,
  listProjectSummaries,
  loadProject,
  saveProjectSnapshot,
} from '../lib/projectStorage'

export function ProjectRecordsPanel() {
  const { state, dispatch } = useApp()
  const [refresh, setRefresh] = useState(0)

  const summaries = useMemo(() => listProjectSummaries(), [refresh, state.projectId, state.reports.length, state.files.length])

  const switchProject = (projectId: string) => {
    if (projectId === state.projectId) return
    saveProjectSnapshot(state)
    const snapshot = loadProject(projectId)
    if (!snapshot) return
    dispatch({ type: 'LOAD_PROJECT', snapshot })
    setRefresh((n) => n + 1)
  }

  const newProject = () => {
    if (!confirm('新建项目将保存当前进度，并清空工作区。继续？')) return
    saveProjectSnapshot(state)
    dispatch({ type: 'RESET' })
    setRefresh((n) => n + 1)
  }

  const removeProject = (projectId: string, name: string) => {
    if (!confirm(`确定删除项目「${name}」及其全部记录？`)) return
    deleteProject(projectId)
    if (projectId === state.projectId) dispatch({ type: 'RESET' })
    setRefresh((n) => n + 1)
  }

  if (summaries.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FolderOpen size={16} className="text-blue-600" />
          项目记录
        </h3>
        <button
          type="button"
          onClick={newProject}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <Plus size={14} /> 新建项目
        </button>
      </div>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {summaries.map((p) => (
          <li
            key={p.projectId}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
              p.projectId === state.projectId
                ? 'bg-blue-50 ring-1 ring-blue-200'
                : 'bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <button
              type="button"
              onClick={() => switchProject(p.projectId)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate font-medium text-slate-900">{p.projectName}</div>
              <div className="text-xs text-slate-500">
                步骤 {p.currentStep} · {p.fileCount} 文件 · {p.transactionCount} 笔 · {p.reportCount}{' '}
                报告 · {format(new Date(p.updatedAt), 'MM-dd HH:mm')}
              </div>
            </button>
            {p.projectId !== state.projectId && (
              <button
                type="button"
                onClick={() => removeProject(p.projectId, p.projectName)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="删除项目"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
