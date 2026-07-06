import type { OcrBlock } from '../../types/ocr'
import { getConfidenceStyle } from '../../lib/confidenceStyle'

interface Props {
  blocks: OcrBlock[]
  naturalWidth: number
  naturalHeight: number
  selectedBlockId?: string
  hoveredBlockId?: string
  onSelectBlock: (blockId: string) => void
  onHoverBlock: (blockId: string | undefined) => void
}

export function BboxOverlay({
  blocks,
  naturalWidth,
  naturalHeight,
  selectedBlockId,
  hoveredBlockId,
  onSelectBlock,
  onHoverBlock,
}: Props) {
  if (!naturalWidth || !naturalHeight) return null

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={naturalWidth}
      height={naturalHeight}
    >
      {blocks.map((block) => {
        if (block.bbox.length < 4) return null
        const isSelected = block.id === selectedBlockId
        const isHovered = block.id === hoveredBlockId
        const conf = getConfidenceStyle(block.score)
        const points = block.bbox.map(([x, y]) => `${x},${y}`).join(' ')

        return (
          <polygon
            key={block.id}
            points={points}
            fill={isSelected || isHovered ? conf.fill : `${conf.fill.replace(/[\d.]+\)$/, '0.08)')}`}
            stroke={isSelected ? '#2563eb' : conf.border}
            strokeWidth={isSelected ? 2.5 : 1.5}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={() => onSelectBlock(block.id)}
            onMouseEnter={() => onHoverBlock(block.id)}
            onMouseLeave={() => onHoverBlock(undefined)}
          />
        )
      })}
    </svg>
  )
}
