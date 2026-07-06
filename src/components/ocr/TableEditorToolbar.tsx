import {
  Merge, Plus, Trash2, TableProperties,
  Sparkles, Download, FileSpreadsheet, CheckCircle, Loader2,
  Undo2, Redo2,
} from 'lucide-react'
import type { StatementTable } from '../../types/statementTable'

interface Props {
  table: StatementTable
  selectedRows: number[]
  onMergeRows: () => void
  onSetHeader: () => void
  onInsertRow: () => void
  onDeleteRows: () => void
  onInsertColumn: () => void
  onDeleteColumn: () => void
  onAiAssist: () => void
  onExportCsv: () => void
  onExportExcel: () => void
  onConfirm: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  aiLoading?: boolean
  confirmLoading?: boolean
  showAiAssist?: boolean
}

export function TableEditorToolbar({
  table,
  selectedRows,
  onMergeRows,
  onSetHeader,
  onInsertRow,
  onDeleteRows,
  onInsertColumn,
  onDeleteColumn,
  onAiAssist,
  onExportCsv,
  onExportExcel,
  onConfirm,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  aiLoading,
  confirmLoading,
  showAiAssist,
}: Props) {
  const btn =
    'flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={14} /> 撤销
        </button>
        <button type="button" className={btn} onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={14} /> 重做
        </button>
        <button type="button" className={btn} onClick={onMergeRows} disabled={selectedRows.length < 2} title="将选中行横向拼接为一行，列数随之增加">
          <Merge size={14} /> 合并选中行
        </button>
        <button type="button" className={btn} onClick={onSetHeader} disabled={table.rows.length === 0}>
          <TableProperties size={14} /> 首行设为表头
        </button>
        <button type="button" className={btn} onClick={onInsertRow}>
          <Plus size={14} /> 插入行
        </button>
        <button type="button" className={btn} onClick={onDeleteRows} disabled={selectedRows.length === 0}>
          <Trash2 size={14} /> 删除选中行
        </button>
        <button type="button" className={btn} onClick={onInsertColumn}>
          <Plus size={14} /> 插入列
        </button>
        <button type="button" className={btn} onClick={onDeleteColumn} disabled={table.columnCount <= 1}>
          <Trash2 size={14} /> 删除末列
        </button>
        {showAiAssist && (
          <button type="button" className={btn} onClick={onAiAssist} disabled={aiLoading}>
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI 辅助表头
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={onExportCsv}>
          <Download size={14} /> 导出 CSV
        </button>
        <button type="button" className={btn} onClick={onExportExcel}>
          <FileSpreadsheet size={14} /> 导出 Excel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmLoading || table.rows.length === 0}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {confirmLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          确认并解析流水
        </button>
      </div>

      {table.needsReview && (
        <p className="text-xs text-amber-700">
          未自动识别表头，请使用「首行设为表头」或「AI 辅助表头」完善列名后再解析。
        </p>
      )}
    </div>
  )
}
