import type { OcrBlock } from '../../types/ocr'
import { BboxOverlay } from './BboxOverlay'

interface Props {
  imageUrl: string | undefined
  blocks: OcrBlock[]
  naturalWidth: number
  naturalHeight: number
  selectedBlockId?: string
  hoveredBlockId?: string
  onSelectBlock: (blockId: string) => void
  onHoverBlock: (blockId: string | undefined) => void
}

/** 原图预览层（固定 natural 尺寸，由 SyncDualPane 统一缩放） */
export function PdfPreview({
  imageUrl,
  blocks,
  naturalWidth,
  naturalHeight,
  selectedBlockId,
  hoveredBlockId,
  onSelectBlock,
  onHoverBlock,
}: Props) {
  if (!imageUrl) return null

  return (
    <div
      className="relative select-none"
      style={{ width: naturalWidth, height: naturalHeight }}
    >
      <img
        src={imageUrl}
        alt="页面预览"
        className="block h-full w-full object-fill select-none"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
      <BboxOverlay
        blocks={blocks}
        naturalWidth={naturalWidth}
        naturalHeight={naturalHeight}
        selectedBlockId={selectedBlockId}
        hoveredBlockId={hoveredBlockId}
        onSelectBlock={onSelectBlock}
        onHoverBlock={onHoverBlock}
      />
    </div>
  )
}
