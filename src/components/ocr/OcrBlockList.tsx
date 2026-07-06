import { useState } from 'react'
import type { OcrBlock } from '../../types/ocr'
import { getBlockText } from '../../types/ocr'

interface Props {
  blocks: OcrBlock[]
  selectedBlockId?: string
  onSelectBlock: (blockId: string) => void
  onEditBlock: (blockId: string, text: string) => void
}

export function OcrBlockList({ blocks, selectedBlockId, onSelectBlock, onEditBlock }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (block: OcrBlock) => {
    setEditingId(block.id)
    setEditValue(getBlockText(block))
  }

  const saveEdit = (blockId: string) => {
    onEditBlock(blockId, editValue)
    setEditingId(null)
  }

  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        暂无 OCR 结果，请先识别当前页或选择页范围批量识别
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-2 py-2 w-8">#</th>
            <th className="px-2 py-2">文本</th>
            <th className="px-2 py-2 w-14">置信度</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr
              key={block.id}
              className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${
                selectedBlockId === block.id ? 'bg-blue-50' : ''
              } ${block.editedText ? 'border-l-2 border-l-amber-400' : ''}`}
              onClick={() => onSelectBlock(block.id)}
            >
              <td className="px-2 py-1.5 text-slate-400">{block.lineIndex + 1}</td>
              <td className="px-2 py-1.5">
                {editingId === block.id ? (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 rounded border border-blue-300 px-2 py-1 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(block.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button
                      onClick={() => saveEdit(block.id)}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <span
                    className="block break-all"
                    onDoubleClick={() => startEdit(block)}
                    title="双击编辑"
                  >
                    {getBlockText(block)}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-xs text-slate-500">
                {(block.score * 100).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
