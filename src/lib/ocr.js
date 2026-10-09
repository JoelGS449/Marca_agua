import { createWorker } from 'tesseract.js'
// Build "legacy" de pdf.js: incluye polyfills para Safari de iPhone más antiguos.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Lado mayor (px) con el que se rasteriza cada página: ~250 ppp en tamaño carta, suficiente para Tesseract. */
const OCR_SIDE = 2800
/** Una página de PDF con al menos esta cantidad de caracteres ya trae texto y no necesita OCR. */
const MIN_NATIVE_CHARS = 25

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
export const isSupported = (file) => isPdf(file) || file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|avif|heic|heif)$/i.test(file.name)

/* ---------- Motor de OCR (un solo worker reutilizable) ---------- */
let workerPromise = null
let workerLang = null
let logger = null

async function getWorker(lang) {
  if (!workerPromise) {
    workerLang = lang
    // El modelo de idioma se descarga la primera vez y el navegador lo guarda en caché.
    workerPromise = createWorker(lang, 1, { logger: (m) => logger?.(m) }).catch((e) => {
      workerPromise = null
      throw e
    })
  }
  const worker = await workerPromise
  if (workerLang !== lang) {
    await worker.reinitialize(lang)
    workerLang = lang
  }
  return worker
}

/**
 * Extrae el texto de un PDF o una imagen y genera un PDF con texto seleccionable.
 *
 * @param {File} file
 * @param {{ lang: string, onStatus?: (s: { page: number, pages: number, step: string, progress: number }) => void, isCancelled?: () => boolean }} opts
 * @returns {Promise<{ text: string, pageTexts: string[], pages: number, ocrPages: number, confidence: number | null, pdf: Blob, thumb: string }>}
 */
export async function extractText(file, { lang, onStatus = () => {}, isCancelled = () => false }) {
  const pages = isPdf(file) ? await openPdf(file) : await openImage(file)
  const out = pages.target ?? (await PDFDocument.create())
  const font = await out.embedFont(StandardFonts.Helvetica)
  const charset = new Set(font.getCharacterSet())

  const texts = []
  const confidences = []
  let thumb = ''

  for (let i = 0; i < pages.count; i++) {
    if (isCancelled()) throw new CancelledError()
    const status = (step, progress = 0) => onStatus({ page: i + 1, pages: pages.count, step, progress })
    status('render')

    const page = await pages.get(i)
    if (i === 0) thumb = await page.thumb()

    if (page.nativeText != null) {
      // La página ya tenía texto (PDF digital): se usa tal cual y no se toca.
      texts.push(page.nativeText)
      continue
    }

    logger = (m) => {
      if (m.status === 'recognizing text') status('ocr', m.progress)
      else if (/loading|initializ/i.test(m.status)) status('model', m.progress)
    }
    const worker = await getWorker(lang)
    status('ocr')
    const { data } = await worker.recognize(page.canvas, {}, { text: true, blocks: true })
    logger = null

    texts.push(data.text.trim())
    if (data.text.trim()) confidences.push(data.confidence)

    const pdfPage = page.pdfPage ?? (await page.addTo(out))
    addTextLayer(pdfPage, font, charset, data.blocks ?? [], page.toPdf)
    page.release()
  }

  if (!pages.target) {
    out.setTitle(file.name.replace(/\.[^.]+$/, ''))
  }
  out.setProducer('Sello')
  const bytes = await out.save()

  const multi = texts.length > 1
  const text = texts
    .map((t, i) => (multi ? `--- Página ${i + 1} ---\n\n${t}` : t))
    .join('\n\n')
    .trim()

  return {
    text,
    pageTexts: texts,
    pages: pages.count,
    ocrPages: confidences.length,
    confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
    pdf: new Blob([bytes], { type: 'application/pdf' }),
    thumb,
  }
}

export class CancelledError extends Error {}

/* ---------- PDF solo con el texto extraído ---------- */
const PAGE_W = 612 // Carta, en puntos.
const PAGE_H = 792
const MARGIN = 64
const BODY_SIZE = 11
const LEADING = 15.5

/**
 * Genera un PDF limpio que contiene únicamente el texto extraído, con un encabezado por página del original.
 *
 * @param {string[]} pageTexts Texto de cada página del documento original.
 * @param {string} title
 * @returns {Promise<Blob>}
 */
export async function textToPdf(pageTexts, title) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const charset = new Set(font.getCharacterSet())
  const maxWidth = PAGE_W - MARGIN * 2

  let page
  let y
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
  }
  const ensure = (h) => {
    if (y - h < MARGIN) newPage()
  }
  const draw = (text, f, size, gap) => {
    ensure(gap)
    y -= gap
    page.drawText(text, { x: MARGIN, y, size, font: f })
  }

  newPage()
  for (const line of wrap(sanitize(title, charset), bold, 16, maxWidth)) draw(line, bold, 16, 20)
  y -= 10

  const multi = pageTexts.length > 1
  pageTexts.forEach((raw, i) => {
    if (multi) {
      y -= i ? 14 : 4
      draw(`Página ${i + 1}`, bold, 9.5, 14)
      y -= 6
    }
    const text = raw.trim()
    if (!text) {
      draw('(Sin texto en esta página)', font, BODY_SIZE, LEADING)
      return
    }
    for (const para of text.split(/\r?\n/)) {
      const clean = sanitize(para.replace(/\t/g, '    '), charset).trimEnd()
      if (!clean) {
        y -= LEADING * 0.6
        continue
      }
      for (const line of wrap(clean, font, BODY_SIZE, maxWidth)) draw(line, font, BODY_SIZE, LEADING)
    }
  })

  doc.setTitle(title)
  doc.setProducer('Sello')
  return new Blob([await doc.save()], { type: 'application/pdf' })
}

/** Corta un párrafo en líneas que caben en el ancho; las palabras demasiado largas se parten. */
function wrap(text, font, size, maxWidth) {
  const fits = (s) => font.widthOfTextAtSize(s, size) <= maxWidth
  const lines = []
  let current = ''
  for (const word of text.split(/ +/)) {
    const candidate = current ? `${current} ${word}` : word
    if (fits(candidate)) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    while (!fits(current)) {
      let n = current.length - 1
      while (n > 1 && !fits(current.slice(0, n))) n--
      lines.push(current.slice(0, n))
      current = current.slice(n)
    }
  }
  if (current) lines.push(current)
  return lines
}

/* ---------- Entrada: PDF ---------- */
async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // pdf.js se queda con el buffer que recibe, por eso le pasamos una copia.
  const src = await pdfjs.getDocument({ data: bytes.slice() }).promise

  // Se modifica el PDF original para conservar su calidad (vectores, imágenes, metadatos).
  // Si está cifrado y pdf-lib no puede reescribirlo, se reconstruye a partir de imágenes.
  let target = null
  try {
    target = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch {}

  return {
    count: src.numPages,
    target,
    async get(i) {
      const page = await src.getPage(i + 1)
      const base = page.getViewport({ scale: 1 })

      if (target) {
        const content = await page.getTextContent()
        const native = content.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : '')).join('')
        if (native.replace(/\s/g, '').length >= MIN_NATIVE_CHARS) {
          return {
            nativeText: native.trim(),
            thumb: () => renderThumb(page),
          }
        }
      }

      const scale = Math.min(4, OCR_SIDE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, canvas, viewport }).promise

      if (target) {
        return {
          canvas,
          pdfPage: target.getPage(i),
          // convertToPdfPoint toma en cuenta la rotación y el recorte de la página original.
          toPdf: (x, y) => viewport.convertToPdfPoint(x, y),
          thumb: () => thumbFrom(canvas),
          release: () => releaseCanvas(canvas),
        }
      }
      return rasterPage(canvas, base.width / canvas.width)
    },
  }
}

/* ---------- Entrada: imagen ---------- */
async function openImage(file) {
  const url = URL.createObjectURL(file)
  let canvas
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, OCR_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k)
    canvas.height = Math.round(img.naturalHeight * k)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  } finally {
    URL.revokeObjectURL(url)
  }
  // La página del PDF mide lo mismo que una hoja carta en su lado mayor (792 pt).
  const ptPerPx = 792 / Math.max(canvas.width, canvas.height)
  return { count: 1, target: null, get: async () => rasterPage(canvas, ptPerPx) }
}

/** Página nueva en el PDF de salida con la imagen de fondo y el texto invisible encima. */
function rasterPage(canvas, ptPerPx) {
  const w = canvas.width * ptPerPx
  const h = canvas.height * ptPerPx
  return {
    canvas,
    toPdf: (x, y) => [x * ptPerPx, h - y * ptPerPx],
    thumb: () => thumbFrom(canvas),
    async addTo(doc) {
      const image = await doc.embedJpg(await canvasToBytes(canvas))
      const page = doc.addPage([w, h])
      page.drawImage(image, { x: 0, y: 0, width: w, height: h })
      return page
    },
    release: () => releaseCanvas(canvas),
  }
}

/* ---------- Capa de texto invisible ---------- */
function addTextLayer(page, font, charset, blocks, toPdf) {
  const fontKey = page.node.newFontDictionary('OcrText', font.ref)
  const ops = [beginText(), setTextRenderingMode(TextRenderingMode.Invisible)]

  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const words = (line.words ?? []).filter((w) => w.text.trim())
        const lineHeight = line.bbox.y1 - line.bbox.y0

        words.forEach((word, idx) => {
          const text = sanitize(word.text, charset)
          if (!text) return
          const { x0, x1 } = word.bbox
          const baseY = baselineAt(line, (x0 + x1) / 2) ?? word.bbox.y1

          // Puntos del inicio y fin de la palabra sobre la línea base, ya en coordenadas del PDF.
          const [ax, ay] = toPdf(x0, baseY)
          const [bx, by] = toPdf(x1, baseY)
          const width = Math.hypot(bx - ax, by - ay)
          if (width < 0.5) return
          const angle = Math.atan2(by - ay, bx - ax)

          // Alto de letra a partir de la altura de la línea, convertido a puntos.
          const [tx, ty] = toPdf(x0, baseY - lineHeight)
          const size = Math.max(2, Math.hypot(tx - ax, ty - ay) * 0.78)

          // Ajusta el ancho horizontal para que la selección coincida con la palabra en la imagen.
          const natural = font.widthOfTextAtSize(text, size)
          const squeeze = natural > 0 ? Math.min(500, Math.max(10, (width / natural) * 100)) : 100

          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          ops.push(
            setFontAndSize(fontKey, size),
            setCharacterSqueeze(squeeze),
            setTextMatrix(cos, sin, -sin, cos, ax, ay),
            // El espacio final ayuda a que al copiar las palabras no salgan pegadas.
            showText(font.encodeText(idx < words.length - 1 ? `${text} ` : text)),
          )
        })
      }
    }
  }

  ops.push(endText())
  page.pushOperators(...ops)
}

function baselineAt(line, x) {
  const b = line.baseline
  if (!b || b.x1 === b.x0) return null
  return b.y0 + ((b.y1 - b.y0) * (x - b.x0)) / (b.x1 - b.x0)
}

/** Helvetica solo cubre caracteres latinos (WinAnsi); lo demás se reemplaza para no romper el PDF. */
function sanitize(text, charset) {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    out += charset.has(ch.codePointAt(0)) ? ch : '?'
  }
  return out
}

/* ---------- Utilidades de canvas ---------- */
function thumbFrom(canvas, side = 480) {
  const k = side / Math.max(canvas.width, canvas.height)
  const c = document.createElement('canvas')
  c.width = Math.round(canvas.width * k)
  c.height = Math.round(canvas.height * k)
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}

async function renderThumb(page, side = 480) {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: side / Math.max(base.width, base.height) })
  const c = document.createElement('canvas')
  c.width = Math.round(viewport.width)
  c.height = Math.round(viewport.height)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, canvas: c, viewport }).promise
  return c.toDataURL('image/jpeg', 0.8)
}

function canvasToBytes(canvas) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((buf) => res(new Uint8Array(buf)), rej) : rej(new Error('toBlob'))), 'image/jpeg', 0.85),
  )
}

/** Safari limita la memoria total de canvas; soltar el lienzo al terminar evita errores en documentos largos. */
function releaseCanvas(canvas) {
  canvas.width = 0
  canvas.height = 0
}
