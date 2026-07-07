import { format } from 'date-fns'
import { Cloud, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../store/AuthContext'
import {
  deleteProject,
  listProjectSummaries,
  loadProject,
  saveProjectSnapshot,
  type ProjectSummary,
} from '../lib/projectStorage'
import {
  deleteCloudProject,
  isCloudSyncEnabled,
  listCloudProjects,
  loadCloudProject,
} from '../lib/supabaseProjects'

function mergeSummaries(local: ProjectSummary[], cloud: ProjectSummary[]): ProjectSummary[] {
  const map = new Map<string, ProjectSummary>()
  for (const item of local) map.set(item.projectId, item)
  for (const item of cloud) {
    const existing = map.get(item.projectId)
    if (!existing || item.updatedAt > existing.updatedAt) {
      map.set(item.projectId, item)
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function ProjectRecordsPanel() {
  const { state, dispatch } = useApp()
  const { user } = useAuth()
  const [refresh, setRefresh] = useState(0)
  const [cloudSummaries, setCloudSummaries] = useState<ProjectSummary[]>([])

  useEffect(() => {
    if (!isCloudSyncEnabled() || !user) {
      setCloudSummaries([])
      return
    }
    void listCloudProjects()
      .then(setCloudSummaries)
      .catch((err) => console.warn('[cloud-projects]', err))
  }, [user, refresh, state.projectId])

  const summaries = useMemo(() => {
    const local = listProjectSummaries()
    if (!isCloudSyncEnabled() || !user) return local
    return mergeSummaries(local, cloudSummaries)
  }, [refresh, state.projectId, state.reports.length, state.files.length, cloudSummaries, user])

  const switchProject = async (projectId: string) => {
    if (projectId === state.projectId) return
    saveProjectSnapshot(state)

    let snapshot = loadProject(projectId)
    if (!snapshot && isCloudSyncEnabled() && user) {
      snapshot = await loadCloudProject(projectId)
    }
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

  const removeProject = async (projectId: string, name: string) => {
    if (!confirm(`确定删除项目「${name}」及其全部记录？`)) return
    deleteProject(projectId)
    if (isCloudSyncEnabled() && user) {
      try {
        await deleteCloudProject(projectId)
      } catch (err) {
        console.warn('[cloud-delete]', err)
      }
    }
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
          {isCloudSyncEnabled() && user && (
            <span className="flex items-center gap-1 text-xs font-normal text-slate-500">
              <Cloud size={12} /> 已同步云端
            </span>
          )}
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
              onClick={() => void switchProject(p.projectId)}
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
                onClick={() => void removeProject(p.projectId, p.projectName)}
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
