import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileSpreadsheet, FileText, Image, Upload, Loader2, AlertCircle } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useApp } from '../store/AppContext'
import { fileToBase64, parseExcelBase64 } from '../lib/api'
import { createOcrDocumentFromFile, isExcelFile, isOcrFile } from '../lib/ocrDocument'
import { cacheFile } from '../lib/fileCache'
import { loadPdfDocument } from '../lib/pdfUtils'
import type { UploadedFile } from '../types'
import { SOURCE_PLATFORMS } from '../types'

const ACCEPT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
  'application/pdf': ['.pdf'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp'],
}

export function FileUpload() {
  const { dispatch } = useApp()
  const [processing, setProcessing] = useState(false)
  const [platform, setPlatform] = useState('其他')
  const [errors, setErrors] = useState<string[]>([])

  const processFile = useCallback(
    async (file: File) => {
      const fileId = uuidv4()
      const uploaded: UploadedFile = {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        sourcePlatform: platform,
        status: 'processing',
      }
      dispatch({ type: 'ADD_FILE', file: uploaded })

      try {
        if (isExcelFile(file)) {
          const base64 = await fileToBase64(file)
          const result = await parseExcelBase64(base64, file.name)
          const transactions = result.transactions.map((t) => ({
            ...t,
            fileId,
            sourcePlatform: platform,
          }))
          dispatch({ type: 'ADD_TRANSACTIONS', transactions })
          dispatch({
            type: 'UPDATE_FILE',
            id: fileId,
            updates: { status: 'done', transactionCount: transactions.length },
          })
        } else if (isOcrFile(file)) {
          cacheFile(fileId, file)
          if (file.name.toLowerCase().endsWith('.pdf')) {
            await loadPdfDocument(file, fileId)
          }
          const ocrDoc = await createOcrDocumentFromFile(file, fileId, platform)
          dispatch({ type: 'SET_OCR_DOCUMENT', document: ocrDoc })
          dispatch({
            type: 'UPDATE_FILE',
            id: fileId,
            updates: { status: 'ocr_review', needsOcrReview: true },
          })
        } else {
          throw new Error(`不支持的文件格式: ${file.name}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '处理失败'
        dispatch({
          type: 'UPDATE_FILE',
          id: fileId,
          updates: { status: 'error', error: msg },
        })
        setErrors((prev) => [...prev, `${file.name}: ${msg}`])
      }
    },
    [dispatch, platform],
  )

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return
      setProcessing(true)
      setErrors([])

      for (const file of accepted) {
        await processFile(file)
        if (isOcrFile(file)) break
      }

      setProcessing(false)
    },
    [processFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    disabled: processing,
    multiple: true,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">来源平台</label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          {SOURCE_PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'
        } ${processing ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        {processing ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-500" />
        ) : (
          <Upload className="mx-auto h-12 w-12 text-slate-400" />
        )}
        <p className="mt-4 text-lg font-medium text-slate-700">
          {isDragActive ? '释放文件开始识别' : '拖入流水文件，或点击选择'}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          PDF/图片将进入 OCR 工作台逐页识别；Excel/CSV 直接解析
        </p>
        <div className="mt-4 flex justify-center gap-4 text-slate-400">
          <FileSpreadsheet size={20} />
          <FileText size={20} />
          <Image size={20} />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          {errors.map((e, i) => (
            <p key={i} className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} /> {e}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
