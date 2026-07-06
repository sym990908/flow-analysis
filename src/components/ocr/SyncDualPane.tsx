import type { ReactNode, RefObject } from 'react'
import { useEffect, useRef } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Link2, Link2Off } from 'lucide-react'
import { useDualViewport } from '../../hooks/useDualViewport'

interface PaneProps {
  label: string
  side: 'left' | 'right'
  naturalWidth: number
  naturalHeight: number
  children: ReactNode
  viewport: ReturnType<typeof useDualViewport>
  /** 原图侧禁用浏览器文本/图片选中（避免拖选变蓝） */
  suppressSelection?: boolean
  containerRef?: RefObject<HTMLDivElement | null>
}

function ViewportPane({
  label,
  side,
  naturalWidth,
  naturalHeight,
  children,
  viewport,
  suppressSelection = false,
  containerRef,
}: PaneProps) {
  const vp = viewport.getViewport(side)
  const paneRef = useRef<HTMLDivElement>(null)

  const setPaneRef = (node: HTMLDivElement | null) => {
    paneRef.current = node
    if (containerRef) {
      containerRef.current = node
    }
  }

  useEffect(() => {
    const el = paneRef.current
    if (!el) return

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = el.getBoundingClientRect()
      viewport.applyWheelZoom(side, e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
    }

    el.addEventListener('wheel', onWheelNative, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheelNative, { capture: true })
  }, [side, viewport.applyWheelZoom])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => viewport.zoomOut(side)}
            className="rounded border border-slate-300 p-1 hover:bg-slate-50"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => viewport.zoomIn(side)}
            className="rounded border border-slate-300 p-1 hover:bg-slate-50"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => viewport.reset(side)}
            className="rounded border border-slate-300 p-1 hover:bg-slate-50"
            title="重置"
          >
            <RotateCcw size={14} />
          </button>
          <span className="text-[10px] text-slate-400">{Math.round(vp.scale * 100)}%</span>
        </div>
      </div>
      <div
        ref={setPaneRef}
        className={`relative h-[55vh] cursor-grab overflow-hidden overscroll-contain rounded-lg border border-slate-200 bg-slate-100 active:cursor-grabbing ${
          suppressSelection ? 'select-none' : ''
        }`}
        onPointerDown={(e) => viewport.onPointerDown(side, e)}
        onPointerMove={(e) => viewport.onPointerMove(side, e)}
        onPointerUp={viewport.onPointerUp}
        onPointerLeave={viewport.onPointerUp}
        onSelectStart={suppressSelection ? (e) => e.preventDefault() : undefined}
        onDoubleClick={suppressSelection ? (e) => e.preventDefault() : undefined}
        onDragStart={suppressSelection ? (e) => e.preventDefault() : undefined}
      >
        <div
          style={{
            transform: `translate(${vp.offsetX}px, ${vp.offsetY}px) scale(${vp.scale})`,
            transformOrigin: '0 0',
            width: naturalWidth,
            height: naturalHeight,
          }}
          className={`relative bg-white shadow-sm ${suppressSelection ? 'select-none' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

interface Props {
  naturalWidth: number
  naturalHeight: number
  left: ReactNode
  right: ReactNode
  loading?: boolean
  error?: string
}

export function SyncDualPane({
  naturalWidth,
  naturalHeight,
  left,
  right,
  loading,
  error,
}: Props) {
  const viewport = useDualViewport(naturalWidth, naturalHeight)
  const fitContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = fitContainerRef.current
    if (!el || !naturalWidth || !naturalHeight) return

    const updateFit = () => {
      viewport.fitToContainer(el.clientWidth, el.clientHeight)
    }

    updateFit()
    const observer = new ResizeObserver(updateFit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [naturalWidth, naturalHeight, viewport.fitToContainer])

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg bg-red-50 text-sm text-red-600">
        {error}
      </div>
    )
  }

  if (loading || !naturalWidth || !naturalHeight) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        正在加载预览...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => viewport.setSyncEnabled(!viewport.syncEnabled)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            viewport.syncEnabled
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          {viewport.syncEnabled ? <Link2 size={14} /> : <Link2Off size={14} />}
          {viewport.syncEnabled ? '同步已开启' : '同步已关闭'}
        </button>
        <span className="text-xs text-slate-400">
          {viewport.syncEnabled
            ? '左右视窗缩放/平移同步 · 关闭后可独立调整'
            : '左右视窗独立 · 分别缩放/拖拽对照'}
        </span>
        {viewport.syncEnabled && (
          <button
            type="button"
            onClick={viewport.resetAll}
            className="text-xs text-blue-600 hover:underline"
          >
            重置全部
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <ViewportPane
          label="原图"
          side="left"
          naturalWidth={naturalWidth}
          naturalHeight={naturalHeight}
          viewport={viewport}
          suppressSelection
          containerRef={fitContainerRef}
        >
          {left}
        </ViewportPane>
        <ViewportPane
          label="OCR 文本"
          side="right"
          naturalWidth={naturalWidth}
          naturalHeight={naturalHeight}
          viewport={viewport}
        >
          {right}
        </ViewportPane>
      </div>
    </div>
  )
}
