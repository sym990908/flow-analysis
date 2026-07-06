import { useCallback, useRef, useState } from 'react'
import type { ViewportState } from './useSyncViewport'

export type ViewportSide = 'left' | 'right'

const MIN_SCALE = 0.05
const MAX_SCALE = 4

export function computeFitViewport(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ViewportState {
  if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }

  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight)
  /** 适应窗口时不设下限，否则大图会被 MIN_SCALE 卡住显示过大 */
  const clampedScale = Math.min(MAX_SCALE, Math.max(0.01, scale))
  const scaledW = naturalWidth * clampedScale
  const scaledH = naturalHeight * clampedScale

  return {
    scale: clampedScale,
    offsetX: (containerWidth - scaledW) / 2,
    offsetY: (containerHeight - scaledH) / 2,
  }
}

/** 以容器内某点为中心缩放（滚轮缩放） */
export function zoomViewportAtPoint(
  v: ViewportState,
  pointerX: number,
  pointerY: number,
  scaleFactor: number,
): ViewportState {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * scaleFactor))
  if (newScale === v.scale) return v

  return {
    scale: newScale,
    offsetX: pointerX - ((pointerX - v.offsetX) * newScale) / v.scale,
    offsetY: pointerY - ((pointerY - v.offsetY) * newScale) / v.scale,
  }
}

export function useDualViewport(naturalWidth: number, naturalHeight: number) {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const fitRef = useRef<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 })
  const [leftViewport, setLeftViewport] = useState<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 })
  const [rightViewport, setRightViewport] = useState<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 })
  const dragRef = useRef<{ side: ViewportSide; x: number; y: number } | null>(null)

  const fitToContainer = useCallback(
    (containerWidth: number, containerHeight: number) => {
      const fit = computeFitViewport(containerWidth, containerHeight, naturalWidth, naturalHeight)
      fitRef.current = fit
      setLeftViewport(fit)
      setRightViewport(fit)
    },
    [naturalWidth, naturalHeight],
  )

  const getViewport = useCallback(
    (side: ViewportSide): ViewportState =>
      syncEnabled ? leftViewport : side === 'left' ? leftViewport : rightViewport,
    [syncEnabled, leftViewport, rightViewport],
  )

  const setViewport = useCallback(
    (side: ViewportSide, updater: (v: ViewportState) => ViewportState) => {
      if (syncEnabled) {
        setLeftViewport(updater)
        setRightViewport(updater)
      } else if (side === 'left') {
        setLeftViewport(updater)
      } else {
        setRightViewport(updater)
      }
    },
    [syncEnabled],
  )

  const zoomIn = useCallback(
    (side: ViewportSide) => {
      setViewport(side, (v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.2) }))
    },
    [setViewport],
  )

  const zoomOut = useCallback(
    (side: ViewportSide) => {
      setViewport(side, (v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.2) }))
    },
    [setViewport],
  )

  const reset = useCallback(
    (side: ViewportSide) => {
      const fit = fitRef.current
      if (syncEnabled) {
        setLeftViewport(fit)
        setRightViewport(fit)
      } else if (side === 'left') {
        setLeftViewport(fit)
      } else {
        setRightViewport(fit)
      }
    },
    [syncEnabled],
  )

  const resetAll = useCallback(() => {
    const fit = fitRef.current
    setLeftViewport(fit)
    setRightViewport(fit)
  }, [])

  const applyWheelZoom = useCallback(
    (side: ViewportSide, deltaY: number, pointerX: number, pointerY: number) => {
      const scaleFactor = deltaY > 0 ? 0.9 : 1.1
      setViewport(side, (v) => zoomViewportAtPoint(v, pointerX, pointerY, scaleFactor))
    },
    [setViewport],
  )

  const onWheel = useCallback(
    (side: ViewportSide, e: React.WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      applyWheelZoom(side, e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
    },
    [applyWheelZoom],
  )

  const onPointerDown = useCallback((side: ViewportSide, e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('textarea, input, button, a, [data-no-pan]')) return
    e.preventDefault()
    dragRef.current = { side, x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (side: ViewportSide, e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.side !== side) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      dragRef.current = { side, x: e.clientX, y: e.clientY }
      setViewport(side, (v) => ({ ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy }))
    },
    [setViewport],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  return {
    syncEnabled,
    setSyncEnabled,
    getViewport,
    fitToContainer,
    zoomIn,
    zoomOut,
    reset,
    resetAll,
    applyWheelZoom,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
