import { useEffect, useRef } from 'react'
import { useApp } from '../store/AppContext'
import { saveProjectSnapshot } from '../lib/projectStorage'

/** 自动将项目进度与报告记录写入 localStorage */
export function ProjectPersistence() {
  const { state } = useApp()
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const timer = window.setTimeout(() => {
      saveProjectSnapshot(state)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    const onUnload = () => saveProjectSnapshot(state)
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [state])

  return null
}
