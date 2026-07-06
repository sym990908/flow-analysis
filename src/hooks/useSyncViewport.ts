import { useCallback, useRef, useState } from 'react'

export interface ViewportState {
  scale: number
  offsetX: number
  offsetY: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4

export function useSyncViewport(initial: ViewportState = { scale: 1, offsetX: 0, offsetY: 0 }) {
  const [viewport, setViewport] = useState<ViewportState>(initial)
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const zoomIn = useCallback(() => {
    setViewport((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.2) }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewport((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.2) }))
  }, [])

  const reset = useCallback(() => {
    setViewport({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setViewport((v) => ({
      ...v,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * delta)),
    }))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setViewport((v) => ({ ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy }))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  return {
    viewport,
    zoomIn,
    zoomOut,
    reset,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
