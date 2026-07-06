import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
import type { OcrRotation } from '../types/ocr'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** CCITT/JBIG2 解码所需 wasm 目录（public/wasm/） */
const PDF_WASM_URL = `${import.meta.env.BASE_URL}wasm/`

const pdfCache = new Map<string, PDFDocumentProxy>()
/** 每页 rotation=0 的基础渲染缓存（旋转仅做 canvas 变换，避免重复解码 CCITT 蒙版） */
const pageBaseCanvasCache = new Map<string, HTMLCanvasElement>()
const pageBaseRenderInflight = new Map<string, Promise<HTMLCanvasElement>>()

/** 预览渲染倍率（1×，与 OCR 坐标一致） */
export const PDF_NATIVE_SCALE = 1
/** OCR 上传默认倍率（1×，降低 Netlify 提交耗时） */
export const OCR_RENDER_SCALE = 1

/** Netlify Function 请求体上限约 6MB，二进制有效约 4.5MB，留安全余量 */
export const OCR_MAX_BYTES = 3_800_000
/** 失败重试 OCR：最长边与体积上限 */
export const OCR_RETRY_MAX_LONG_EDGE = 2048
export const OCR_RETRY_MAX_BYTES = 1_000_000

const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  setFillGray: 57,
  setFillRGBColor: 59,
  paintImageMaskXObject: 83,
  paintImageXObject: 85,
} as const

export interface RenderResult {
  canvas: HTMLCanvasElement
  naturalWidth: number
  naturalHeight: number
  renderScale: number
}

export interface OcrImagePayload {
  blob: Blob
  filename: string
  mimeType: string
  width: number
  height: number
  renderScale: number
  compressed: boolean
}

interface PdfImageData {
  bitmap?: ImageBitmap
  width?: number
  height?: number
  data?: Uint8Array | Uint8ClampedArray
  kind?: number
  inverseDecode?: boolean
}

/** pdfjs ImageKind */
const IK = { GRAYSCALE_1BPP: 1, RGB_24BPP: 2, RGBA_32BPP: 3 } as const

function gray1bppToRgba(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  inverseDecode = false,
): Uint8ClampedArray {
  const dest = new Uint8ClampedArray(width * height * 4)
  const rowBytes = Math.ceil(width / 8)
  let di = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = src[y * rowBytes + (x >> 3)] ?? 0
      const bit = (byte >> (7 - (x & 7))) & 1
      const isBlack = inverseDecode ? bit === 0 : bit === 1
      const v = isBlack ? 0 : 255
      dest[di++] = v
      dest[di++] = v
      dest[di++] = v
      dest[di++] = 255
    }
  }
  return dest
}

function mask1bppToAlphaCanvas(imgData: PdfImageData): HTMLCanvasElement | null {
  const width = imgData.width ?? 0
  const height = imgData.height ?? 0
  if (!width || !height || !imgData.data) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const imageData = ctx.createImageData(width, height)
  const rowBytes = Math.ceil(width / 8)
  let di = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = imgData.data[y * rowBytes + (x >> 3)] ?? 0
      const bit = (byte >> (7 - (x & 7))) & 1
      // 与 pdf.js putBinaryImageMask / convertBlackAndWhiteToRGBA 一致
      const paint = imgData.inverseDecode ? bit === 1 : bit === 0
      if (paint) {
        imageData.data[di++] = 255
        imageData.data[di++] = 255
        imageData.data[di++] = 255
        imageData.data[di++] = 255
      } else {
        imageData.data[di++] = 0
        imageData.data[di++] = 0
        imageData.data[di++] = 0
        imageData.data[di++] = 0
      }
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function pdfColorToCss(args: unknown, fn: number): string {
  const raw = Array.isArray(args) ? args[0] : args
  if (typeof raw === 'string') {
    if (raw.startsWith('#') || raw.startsWith('rgb')) return raw
  }
  if (fn === OPS.setFillGray) {
    const gray = typeof raw === 'number' ? raw : 0
    const v = Math.round(Math.max(0, Math.min(1, gray)) * 255)
    return `rgb(${v}, ${v}, ${v})`
  }
  if (Array.isArray(args) && typeof args[0] === 'number') {
    const [r, g, b] = args as number[]
    return `rgb(${Math.round((r ?? 0) * 255)}, ${Math.round((g ?? 0) * 255)}, ${Math.round((b ?? 0) * 255)})`
  }
  return 'rgb(0, 0, 0)'
}

function isFillColorOp(fn: number): boolean {
  return fn === OPS.setFillRGBColor || fn === OPS.setFillGray
}

function extractFillColor(fnArray: number[], argsArray: unknown[], paintIndex: number): string {
  for (let j = paintIndex - 1; j >= 0; j--) {
    if (fnArray[j] === OPS.restore) continue
    if (fnArray[j] === OPS.save) {
      if (j > 0 && isFillColorOp(fnArray[j - 1])) {
        return pdfColorToCss(argsArray[j - 1], fnArray[j - 1])
      }
      break
    }
  }
  for (let j = paintIndex - 1; j >= 0; j--) {
    if (fnArray[j] === OPS.restore) continue
    if (isFillColorOp(fnArray[j])) return pdfColorToCss(argsArray[j], fnArray[j])
    if (
      fnArray[j] === OPS.paintImageXObject ||
      fnArray[j] === OPS.paintImageMaskXObject
    ) {
      break
    }
  }
  return 'rgb(0, 0, 0)'
}

function extractTransform(fnArray: number[], argsArray: unknown[], paintIndex: number): number[] {
  for (let j = paintIndex - 1; j >= 0; j--) {
    if (fnArray[j] === OPS.restore) continue
    if (fnArray[j] === OPS.transform) return argsArray[j] as number[]
    if (fnArray[j] === OPS.save) break
  }
  return [1, 0, 0, 1, 0, 0]
}

function rgb24ToRgba(src: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const dest = new Uint8ClampedArray(width * height * 4)
  let si = 0
  let di = 0
  const len = width * height
  for (let i = 0; i < len; i++) {
    dest[di++] = src[si++] ?? 0
    dest[di++] = src[si++] ?? 0
    dest[di++] = src[si++] ?? 0
    dest[di++] = 255
  }
  return dest
}

function imgDataToCanvas(imgData: PdfImageData): HTMLCanvasElement | null {
  const width = imgData.width ?? 0
  const height = imgData.height ?? 0
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (imgData.bitmap) {
    ctx.drawImage(imgData.bitmap, 0, 0, width, height)
    return canvas
  }

  if (!imgData.data) return null

  let rgba: Uint8ClampedArray
  const kind = imgData.kind ?? IK.RGBA_32BPP

  if (kind === IK.GRAYSCALE_1BPP) {
    rgba = gray1bppToRgba(imgData.data, width, height, imgData.inverseDecode)
  } else if (kind === IK.RGB_24BPP) {
    rgba = rgb24ToRgba(imgData.data, width, height)
  } else if (kind === IK.RGBA_32BPP) {
    rgba =
      imgData.data instanceof Uint8ClampedArray
        ? imgData.data
        : new Uint8ClampedArray(imgData.data)
  } else {
    rgba = gray1bppToRgba(imgData.data, width, height, imgData.inverseDecode)
  }

  const imageData = ctx.createImageData(width, height)
  imageData.data.set(rgba)
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function getObjStore(page: PDFPageProxy, objId: string) {
  const p = page as PDFPageProxy & { commonObjs?: typeof page.objs }
  if (objId.startsWith('g_') && p.commonObjs) return p.commonObjs
  return page.objs
}

function getObjImage(
  page: PDFPageProxy,
  objId: string,
  asMask: boolean,
): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  const store = getObjStore(page, objId)
  return new Promise((resolve) => {
    store.get(objId, (imgData: PdfImageData | null) => {
      if (!imgData) {
        resolve(null)
        return
      }
      const width = imgData.width ?? 1
      const height = imgData.height ?? 1

      if (asMask) {
        if (imgData.bitmap) {
          resolve({ source: imgData.bitmap, width, height })
          return
        }
        const maskCanvas = mask1bppToAlphaCanvas(imgData)
        if (maskCanvas) {
          resolve({ source: maskCanvas, width, height })
          return
        }
      }

      const canvas = imgDataToCanvas(imgData)
      if (canvas) {
        resolve({ source: canvas, width, height })
        return
      }
      if (imgData.bitmap) {
        resolve({ source: imgData.bitmap, width, height })
        return
      }
      resolve(null)
    })
  })
}

interface ImagePaintOp {
  objId: string
  transform: number[]
  isMask: boolean
  fillColor: string
  paintWidth: number
  paintHeight: number
}

export async function loadPdfDocument(file: File, cacheKey?: string): Promise<PDFDocumentProxy> {
  if (cacheKey && pdfCache.has(cacheKey)) {
    return pdfCache.get(cacheKey)!
  }

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    wasmUrl: PDF_WASM_URL,
  })
  const pdf = await loadingTask.promise

  if (cacheKey) {
    pdfCache.set(cacheKey, pdf)
  }

  return pdf
}

export function getCachedPdf(cacheKey: string): PDFDocumentProxy | undefined {
  return pdfCache.get(cacheKey)
}

export function clearPdfCache(cacheKey: string): void {
  pdfCache.delete(cacheKey)
  for (const key of pageBaseCanvasCache.keys()) {
    if (key.startsWith(`${cacheKey}:`)) pageBaseCanvasCache.delete(key)
  }
}

function pageBaseCacheKey(pdfCacheKey: string, pageIndex: number, scale: number): string {
  return `${pdfCacheKey}:${pageIndex}:${scale}`
}

function rotateCanvas(source: HTMLCanvasElement, rotation: OcrRotation): HTMLCanvasElement {
  if (rotation === 0) {
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    copy.getContext('2d')!.drawImage(source, 0, 0)
    return copy
  }
  const isSideways = rotation === 90 || rotation === 270
  const w = isSideways ? source.height : source.width
  const h = isSideways ? source.width : source.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 上下文')
  ctx.translate(w / 2, h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

async function renderPageBaseAtZeroRotation(
  page: PDFPageProxy,
  scale: number,
  pdfCacheKey?: string,
  pageIndex?: number,
): Promise<HTMLCanvasElement> {
  const cacheKey =
    pdfCacheKey !== undefined && pageIndex !== undefined
      ? pageBaseCacheKey(pdfCacheKey, pageIndex, scale)
      : undefined
  if (cacheKey && pageBaseCanvasCache.has(cacheKey)) {
    return pageBaseCanvasCache.get(cacheKey)!
  }
  if (cacheKey && pageBaseRenderInflight.has(cacheKey)) {
    return pageBaseRenderInflight.get(cacheKey)!
  }

  const renderPromise = (async () => {
    const viewport = page.getViewport({ scale, rotation: 0 })
    const canvas = await renderPageInternal(page, viewport)
    if (cacheKey) pageBaseCanvasCache.set(cacheKey, canvas)
    return canvas
  })()

  if (cacheKey) pageBaseRenderInflight.set(cacheKey, renderPromise)
  try {
    return await renderPromise
  } finally {
    if (cacheKey) pageBaseRenderInflight.delete(cacheKey)
  }
}

function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

function transformSize(t: number[]): { w: number; h: number } {
  return {
    w: Math.hypot(t[0], t[1]),
    h: Math.hypot(t[2], t[3]),
  }
}

function resolvePaintObjId(args: unknown): string {
  if (typeof args === 'string') return args
  if (Array.isArray(args)) {
    const first = args[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'data' in first) {
      return String((first as { data: string }).data ?? '')
    }
    return String(first ?? '')
  }
  if (args && typeof args === 'object' && 'data' in args) {
    return String((args as { data: string }).data ?? '')
  }
  return ''
}

/** operator list 中的 transform 为 PDF 用户空间（与 scale=1 viewport 一致） */
function extractImagePaintOps(fnArray: number[], argsArray: unknown[]): ImagePaintOp[] {
  const ops: ImagePaintOp[] = []

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageMaskXObject) continue

    let transform = extractTransform(fnArray, argsArray, i)
    const fillColor = extractFillColor(fnArray, argsArray, i)

    const objId = resolvePaintObjId(argsArray[i])
    if (!objId) continue
    const { w, h } = transformSize(transform)
    ops.push({
      objId,
      transform,
      isMask: fn === OPS.paintImageMaskXObject,
      fillColor,
      paintWidth: w,
      paintHeight: h,
    })
  }

  return ops
}

function pageUserSize(viewport: PageViewport): { pageW: number; pageH: number } {
  const scale = viewport.scale || 1
  return {
    pageW: viewport.width / scale,
    pageH: viewport.height / scale,
  }
}

function isScanPdfPage(ops: ImagePaintOp[], pageW: number, pageH: number): boolean {
  if (ops.length < 2) return false
  const fullPageCount = ops.filter(
    (o) => o.paintWidth >= pageW * 0.85 && o.paintHeight >= pageH * 0.85,
  ).length
  return fullPageCount >= 1 && ops.length >= 3
}

function drawPdfImage(
  ctx: CanvasRenderingContext2D,
  viewport: PageViewport,
  img: CanvasImageSource,
  imgWidth: number,
  imgHeight: number,
  opTransform: number[],
  asMask: boolean,
  fillColor: string,
): void {
  ctx.save()
  const matrix = multiplyTransform(viewport.transform, opTransform)
  ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5])
  ctx.scale(1 / imgWidth, -1 / imgHeight)

  if (asMask) {
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = imgWidth
    maskCanvas.height = imgHeight
    const mctx = maskCanvas.getContext('2d')!
    mctx.drawImage(img, 0, 0, imgWidth, imgHeight)
    mctx.globalCompositeOperation = 'source-in'
    mctx.fillStyle = fillColor
    mctx.fillRect(0, 0, imgWidth, imgHeight)
    ctx.drawImage(maskCanvas, 0, -imgHeight, imgWidth, imgHeight)
  } else {
    ctx.drawImage(img, 0, 0, imgWidth, imgHeight, 0, -imgHeight, imgWidth, imgHeight)
  }
  ctx.restore()
}


async function renderScanPdfPageCustom(
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<HTMLCanvasElement | null> {
  const opList = await page.getOperatorList({ intent: 'display' })
  const paintOps = extractImagePaintOps(opList.fnArray, opList.argsArray)
  const { pageW, pageH } = pageUserSize(viewport)

  if (!isScanPdfPage(paintOps, pageW, pageH)) return null

  const imageCache = new Map<string, { source: CanvasImageSource; width: number; height: number }>()
  for (const op of paintOps) {
    const cacheKey = `${op.objId}:${op.isMask ? 'm' : 'i'}`
    if (imageCache.has(cacheKey)) continue
    const resolved = await getObjImage(page, op.objId, op.isMask)
    if (resolved) imageCache.set(cacheKey, resolved)
  }

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let drawn = 0
  for (const op of paintOps) {
    const cacheKey = `${op.objId}:${op.isMask ? 'm' : 'i'}`
    const resolved = imageCache.get(cacheKey)
    if (!resolved) continue

    drawPdfImage(
      ctx,
      viewport,
      resolved.source,
      resolved.width,
      resolved.height,
      op.transform,
      op.isMask,
      op.fillColor,
    )
    drawn++
  }

  return drawn > 0 ? canvas : null
}

async function renderPageInternal(
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<HTMLCanvasElement> {
  const scanCanvas = await renderScanPdfPageCustom(page, viewport)
  if (scanCanvas) return scanCanvas

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 上下文')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const renderTask = page.render({ canvasContext: ctx, viewport, canvas, intent: 'display' })
  await renderTask.promise
  return canvas
}

export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  rotation: OcrRotation = 0,
  scale = PDF_NATIVE_SCALE,
  pdfCacheKey?: string,
): Promise<RenderResult> {
  const page = await pdf.getPage(pageIndex + 1)
  const baseCanvas = await renderPageBaseAtZeroRotation(
    page,
    scale,
    pdfCacheKey,
    pageIndex,
  )
  const canvas = rotateCanvas(baseCanvas, rotation)
  const viewport = page.getViewport({ scale, rotation })

  return {
    canvas,
    naturalWidth: viewport.width,
    naturalHeight: viewport.height,
    renderScale: scale,
  }
}

export async function renderImageToCanvas(
  file: File,
  rotation: OcrRotation = 0,
): Promise<RenderResult> {
  const bitmap = await createImageBitmap(file)
  const isRotated = rotation === 90 || rotation === 270
  const w = isRotated ? bitmap.height : bitmap.width
  const h = isRotated ? bitmap.width : bitmap.height

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 上下文')

  ctx.translate(w / 2, h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  bitmap.close()

  return {
    canvas,
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
    renderScale: 1,
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('无法生成图片'))),
      type,
      quality,
    )
  })
}

function resizeCanvas(source: HTMLCanvasElement, scaleFactor: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scaleFactor))
  canvas.height = Math.max(1, Math.round(source.height * scaleFactor))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function fitCanvasLongEdge(source: HTMLCanvasElement, maxLongEdge: number) {
  const long = Math.max(source.width, source.height)
  if (long <= maxLongEdge) {
    return { canvas: source, scale: 1, resized: false }
  }
  const factor = maxLongEdge / long
  return {
    canvas: resizeCanvas(source, factor),
    scale: factor,
    resized: true,
  }
}

export async function prepareCanvasForOcr(
  source: HTMLCanvasElement,
  filename: string,
  maxBytes = OCR_MAX_BYTES,
  options?: { forceScale?: number; maxLongEdge?: number; maxBytes?: number },
): Promise<OcrImagePayload> {
  let canvas = source
  let renderScale = 1
  let compressed = false
  const byteLimit = options?.maxBytes ?? maxBytes

  if (options?.maxLongEdge) {
    const fitted = fitCanvasLongEdge(canvas, options.maxLongEdge)
    if (fitted.resized) {
      canvas = fitted.canvas
      renderScale = fitted.scale
      compressed = true
    }
  }

  if (options?.forceScale && options.forceScale < 1) {
    canvas = resizeCanvas(source, options.forceScale)
    renderScale = options.forceScale
    compressed = true
  }

  const qualities = [0.92, 0.85, 0.78, 0.7, 0.62]
  const scaleSteps = options?.forceScale ? [1] : [1, 0.9, 0.8, 0.7, 0.6, 0.5]

  for (const scaleFactor of scaleSteps) {
    if (scaleFactor < 1) {
      canvas = resizeCanvas(source, scaleFactor)
      renderScale = scaleFactor
      compressed = true
    }

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (blob.size <= byteLimit) {
        return {
          blob,
          filename: filename.replace(/\.(png|jpg|jpeg)$/i, '') + '.jpg',
          mimeType: 'image/jpeg',
          width: canvas.width,
          height: canvas.height,
          renderScale,
          compressed,
        }
      }
    }
  }

  throw new Error(
    `单页图片过大（>${Math.round(byteLimit / 1024 / 1024)}MB），请拆分 PDF 或降低扫描分辨率后重试`,
  )
}

export function canvasToBlobUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85)
}

export async function renderThumbnail(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  maxWidth = 80,
): Promise<string> {
  const page = await pdf.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const thumbScale = maxWidth / viewport.width
  const scaledViewport = page.getViewport({ scale: thumbScale })
  const canvas = await renderPageInternal(page, scaledViewport)
  return canvas.toDataURL('image/jpeg', 0.7)
}

export async function renderImageThumbnail(file: File, maxWidth = 80): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = maxWidth / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width * scale
  canvas.height = bitmap.height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 上下文')

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.7)
}

export function mapBboxToPreview(
  bbox: [number, number][],
  ocrWidth: number,
  ocrHeight: number,
  previewWidth: number,
  previewHeight: number,
): [number, number][] {
  if (!ocrWidth || !ocrHeight) return bbox
  const sx = previewWidth / ocrWidth
  const sy = previewHeight / ocrHeight
  return bbox.map(([x, y]) => [x * sx, y * sy])
}
