import { useEffect, useRef } from 'react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../store/AuthContext'
import { saveProjectSnapshot, snapshotFromState } from '../lib/projectStorage'
import { isCloudSyncEnabled, upsertCloudProject } from '../lib/supabaseProjects'

/** 自动将项目进度与报告记录写入 localStorage，登录用户同步到 Supabase */
export function ProjectPersistence() {
  const { state } = useApp()
  const { user } = useAuth()
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const timer = window.setTimeout(() => {
      saveProjectSnapshot(state)
      if (isCloudSyncEnabled() && user) {
        void upsertCloudProject(snapshotFromState(state), user.id).catch((err) => {
          console.warn('[cloud-sync]', err)
        })
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [state, user])

  useEffect(() => {
    const onUnload = () => {
      saveProjectSnapshot(state)
      if (isCloudSyncEnabled() && user) {
        void upsertCloudProject(snapshotFromState(state), user.id).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [state, user])

  return null
}
