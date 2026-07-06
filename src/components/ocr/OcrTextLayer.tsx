import type { OcrBlock } from '../../types/ocr'
import { getBlockText } from '../../types/ocr'
import { getConfidenceStyle } from '../../lib/confidenceStyle'

function bboxBounds(bbox: [number, number][]) {
  const xs = bbox.map(([x]) => x)
  const ys = bbox.map(([, y]) => y)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

interface Props {
  blocks: OcrBlock[]
  naturalWidth: number
  naturalHeight: number
  selectedBlockId?: string
  hoveredBlockId?: string
  onSelectBlock: (blockId: string) => void
  onHoverBlock: (blockId: string | undefined) => void
  onEditBlock: (blockId: string, text: string) => void
}

export function OcrTextLayer({
  blocks,
  naturalWidth,
  naturalHeight,
  selectedBlockId,
  hoveredBlockId,
  onSelectBlock,
  onHoverBlock,
  onEditBlock,
}: Props) {
  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        暂无 OCR 结果
      </div>
    )
  }

  return (
    <div
      className="relative bg-white"
      style={{
        width: naturalWidth,
        height: naturalHeight,
        backgroundImage:
          'linear-gradient(#f1f5f9 1px, transparent 1px), linear-gradient(90deg, #f1f5f9 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {blocks.map((block) => {
        if (block.bbox.length < 4) return null
        const { left, top, width, height } = bboxBounds(block.bbox)
        const style = getConfidenceStyle(block.score)
        const isSelected = block.id === selectedBlockId
        const isHovered = block.id === hoveredBlockId
        const fontSize = Math.max(10, Math.min(height * 0.75, 16))

        return (
          <textarea
            key={block.id}
            value={getBlockText(block)}
            onChange={(e) => onEditBlock(block.id, e.target.value)}
            onClick={() => onSelectBlock(block.id)}
            onFocus={() => onSelectBlock(block.id)}
            onMouseEnter={() => onHoverBlock(block.id)}
            onMouseLeave={() => onHoverBlock(undefined)}
            className="absolute resize-none overflow-hidden border p-0.5 leading-tight outline-none"
            style={{
              left,
              top,
              width: Math.max(width, 24),
              height: Math.max(height, fontSize + 4),
              fontSize,
              color: style.text,
              backgroundColor: isSelected || isHovered ? style.fill : `${style.fill}`,
              borderColor: isSelected ? '#2563eb' : style.border,
              borderWidth: isSelected ? 2 : 1,
              zIndex: isSelected ? 10 : isHovered ? 5 : 1,
            }}
            title={`置信度 ${(block.score * 100).toFixed(0)}%`}
          />
        )
      })}
    </div>
  )
}
