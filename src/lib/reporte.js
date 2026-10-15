import { renderWatermark, withImage } from './watermark.js'

/*
 * Arma el reporte fotográfico en .docx (se abre igual en Word y en Google Docs).
 * Página 1: la primera y la última foto. Después, el resto en orden cronológico.
 */

// Hoja carta con márgenes de 1": quedan 6.5" × 9" útiles (a 96 px por pulgada).
const PAGE = { width: 12240, height: 15840, margin: 1440 } // en twips
const CONTENT_W = 624
const COVER_MAX_H = 290 // dos fotos + título caben en la primera hoja
const ROW_MAX_H = 340 // dos fotos por hoja en el registro

// Foto exportada al documento: suficiente para imprimir sin inflar el archivo
// (Google Docs no convierte documentos de más de ~50 MB).
const EXPORT_MAX_SIDE = 1600
const EXPORT_QUALITY = 0.85

const fechaLarga = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })
const fechaCorta = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

/** Ordena por fecha; ante empate respeta el orden en que se subieron. */
export const cronologico = (photos) => [...photos].sort((a, b) => a.date - b.date || a.id - b.id)

async function exportar(photo, sello) {
  return withImage(photo.file, async (img) => {
    const c = document.createElement('canvas')
    renderWatermark(c, img, { ...sello.settings, name: sello.name, date: photo.date }, { maxSide: EXPORT_MAX_SIDE })
    const blob = await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', EXPORT_QUALITY),
    )
    return { data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height }
  })
}

function caber({ w, h }, maxH) {
  const k = Math.min(CONTENT_W / w, maxH / h, 1)
  return { width: Math.round(w * k), height: Math.round(h * k) }
}

/**
 * photos: fotos listas ({ id, file, date }). sello: { name, settings }.
 * onProgress(hechas, total) se llama al terminar cada foto.
 */
export async function crearReporte({ photos, titulo, sello, onProgress }) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = await import('docx')
  const orden = cronologico(photos)
  const total = orden.length
  const primera = orden[0]
  const ultima = orden[total - 1]

  const imagenes = []
  for (const p of orden) {
    imagenes.push(await exportar(p, sello))
    onProgress?.(imagenes.length, total)
  }

  const foto = (i, maxH) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 120 },
      children: [new ImageRun({ type: 'jpg', data: imagenes[i].data, transformation: caber(imagenes[i], maxH) })],
    })
  const pie = (texto) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: texto, size: 18, color: '6B6478' })],
    })
  const subtitulo = (texto, extra = {}) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, ...extra, text: texto })

  const rango =
    total > 1
      ? `Del ${fechaCorta.format(primera.date)} al ${fechaCorta.format(ultima.date)}`
      : fechaCorta.format(primera.date)
  const datos = [sello.name.trim(), `${total} ${total === 1 ? 'foto' : 'fotos'}`, rango].filter(Boolean).join('  ·  ')

  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: titulo.trim() || 'Reporte fotográfico' }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: datos, color: '6B6478' })] }),
    subtitulo(total > 1 ? 'Primera foto' : 'Foto'),
    foto(0, COVER_MAX_H),
    pie(`Foto 1  ·  ${fechaLarga.format(primera.date)}`),
  ]
  if (total > 1) {
    children.push(
      subtitulo('Última foto'),
      foto(total - 1, COVER_MAX_H),
      pie(`Foto ${total}  ·  ${fechaLarga.format(ultima.date)}`),
    )
  }
  if (total > 2) {
    children.push(subtitulo('Registro cronológico', { pageBreakBefore: true }))
    for (let i = 1; i < total - 1; i++) {
      children.push(foto(i, ROW_MAX_H), pie(`Foto ${i + 1}  ·  ${fechaLarga.format(orden[i].date)}`))
    }
  }

  const doc = new Document({
    creator: sello.name.trim() || 'Sello',
    title: titulo.trim() || 'Reporte fotográfico',
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
