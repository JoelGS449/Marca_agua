import logoUrl from '../assets/portada-logo.jpg'
import { outputRatio, renderWatermark, withImage } from './watermark.js'

/*
 * Reporte fotográfico en .docx (se abre igual en Word y en Google Docs):
 *   1. Portada con los datos del formulario.
 *   2. La primera y la última foto.
 *   3. Un apartado por día: fecha, cuadro de texto y sus fotos en orden.
 * `paginar` decide qué va en cada hoja; la vista previa y el Word usan el mismo
 * resultado, así que lo que se ve antes de descargar es lo que sale.
 */

export const CAMPOS_PORTADA = [
  { id: 'fecha', label: 'FECHA' },
  { id: 'modulo', label: 'MÓDULO' },
  { id: 'clave', label: 'CLAVE DEL MÓDULO' },
  { id: 'escuela', label: 'NOMBRE DE LA ESCUELA' },
  { id: 'psicologa', label: 'NOMBRE DE LA PSICÓLOGA' },
  { id: 'valor', label: 'VALOR,OBJETIVO O FACTOR DE RIESGO A TRABAJAR EN LA SEMANA', multiline: true },
]

// Hoja A4 con márgenes de 1", igual que la plantilla de portada. Medidas en px a 96 ppp.
export const HOJA = { width: 794, height: 1123, margin: 96 }
const TWIPS = 15 // twips por px
export const CONTENT_W = HOJA.width - HOJA.margin * 2 // 602
// Un poco menos que el alto real (931) para que Word nunca empuje una foto a otra hoja.
const CONTENT_H = 890
const LOGO = { width: 568, height: 321 } // tamaño del logo en la plantilla
const EXTREMOS_MAX_H = 330
const DIA_MAX_H = 310 // título + cuadro + dos fotos caben en la primera hoja del día
const ALTO = { titulo: 52, pie: 46, lineaTexto: 21, cuadroMin: 4, cuadroPad: 30, charsPorLinea: 85 }

// Foto exportada al documento: suficiente para imprimir sin inflar el archivo
// (Google Docs no convierte documentos de más de ~50 MB).
const EXPORT_MAX_SIDE = 1600
const EXPORT_QUALITY = 0.85

const fmtDia = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const fmtFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })
const fmtFechaHora = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })
const fmtHora = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export const tituloDia = (d) => mayuscula(fmtDia.format(d).replace(',', ''))
export const pieFoto = (f, conFecha) => `Foto ${f.n}  ·  ${(conFecha ? fmtFechaHora : fmtHora).format(f.photo.date)}`

/** Ordena por fecha; ante empate respeta el orden en que se subieron. */
export const cronologico = (photos) => [...photos].sort((a, b) => a.date - b.date || a.id - b.id)

const claveDia = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Agrupa fotos ya ordenadas por día (hora local). */
export function porDia(orden) {
  const dias = []
  for (const photo of orden) {
    const key = claveDia(photo.date)
    if (dias.at(-1)?.key !== key) dias.push({ key, date: photo.date, photos: [] })
    dias.at(-1).photos.push(photo)
  }
  return dias
}

/** "6 al 10 de octubre de 2026", para sugerir la fecha de la portada. */
export function rangoFechas(orden) {
  if (!orden.length) return ''
  const a = orden[0].date
  const b = orden.at(-1).date
  if (claveDia(a) === claveDia(b)) return fmtFecha.format(a)
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()} al ${fmtFecha.format(b)}`
  return `${fmtFecha.format(a)} al ${fmtFecha.format(b)}`
}

function caber(photo, sello, maxH) {
  const ratio = outputRatio(photo.preview.width, photo.preview.height, sello.settings)
  const height = Math.min(maxH, CONTENT_W / ratio)
  return { width: Math.round(height * ratio), height: Math.round(height) }
}

function altoCuadro(texto) {
  const lineas = (texto || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / ALTO.charsPorLinea)), 0)
  return Math.max(ALTO.cuadroMin, lineas) * ALTO.lineaTexto + ALTO.cuadroPad
}

/**
 * Reparte el contenido en hojas.
 * photos: fotos listas ({ id, date, preview }). textos: { [claveDia]: string }.
 */
export function paginar({ photos, textos, sello }) {
  const orden = cronologico(photos)
  if (!orden.length) return []
  const foto = (photo, maxH) => ({ photo, n: orden.indexOf(photo) + 1, size: caber(photo, sello, maxH) })

  const hojas = [{ tipo: 'portada' }]
  const extremos = orden.length > 1 ? [orden[0], orden.at(-1)] : [orden[0]]
  hojas.push({ tipo: 'extremos', fotos: extremos.map((p) => foto(p, EXTREMOS_MAX_H)) })

  for (const dia of porDia(orden)) {
    const texto = textos[dia.key] ?? ''
    let hoja = { tipo: 'dia', dia, titulo: true, cuadro: true, texto, fotos: [] }
    let usado = ALTO.titulo + altoCuadro(texto)
    for (const photo of dia.photos) {
      const f = foto(photo, DIA_MAX_H)
      const alto = f.size.height + ALTO.pie
      if (hoja.fotos.length && usado + alto > CONTENT_H) {
        hojas.push(hoja)
        hoja = { tipo: 'dia', dia, titulo: false, cuadro: false, texto, fotos: [] }
        usado = 0
      }
      hoja.fotos.push(f)
      usado += alto
    }
    hojas.push(hoja)
  }
  return hojas
}

async function exportar(photo, sello) {
  return withImage(photo.file, async (img) => {
    const c = document.createElement('canvas')
    renderWatermark(c, img, { ...sello.settings, name: sello.name, date: photo.date }, { maxSide: EXPORT_MAX_SIDE })
    const blob = await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', EXPORT_QUALITY),
    )
    return new Uint8Array(await blob.arrayBuffer())
  })
}

/** onProgress(hechas, total) se llama al terminar cada foto. */
export async function crearReporte({ photos, portada, textos, sello, onProgress }) {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType, BorderStyle } = docx
  const { HeadingLevel, HeightRule, WidthType } = docx

  const hojas = paginar({ photos, textos, sello })
  const orden = cronologico(photos)
  const datos = new Map()
  for (const p of orden) {
    datos.set(p.id, await exportar(p, sello))
    onProgress?.(datos.size, orden.length)
  }
  const logo = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer())

  const imagen = (f, extra) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 120 },
      ...extra,
      children: [new ImageRun({ type: 'jpg', data: datos.get(f.photo.id), transformation: f.size })],
    })
  const pie = (texto) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: texto, size: 18, color: '6B6478' })],
    })
  const titulo = (texto, extra) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, ...extra, text: texto })
  const lineas = (texto, run = {}) =>
    texto.split('\n').flatMap((l, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: l, ...run })])

  const borde = { style: BorderStyle.SINGLE, size: 6, color: 'B9B2C4' }
  const cuadro = (texto) =>
    new Table({
      width: { size: CONTENT_W * TWIPS, type: WidthType.DXA },
      columnWidths: [CONTENT_W * TWIPS],
      borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
      rows: [
        new TableRow({
          height: { value: altoCuadro(texto) * TWIPS, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              margins: { top: 140, bottom: 140, left: 180, right: 180 },
              children: (texto.trim() ? texto.trim() : '').split(/\n{2,}/).map((p) => new Paragraph({ children: lineas(p) })),
            }),
          ],
        }),
      ],
    })

  const children = []
  for (const [i, hoja] of hojas.entries()) {
    const salto = i > 0 ? { pageBreakBefore: true } : {}
    if (hoja.tipo === 'portada') {
      children.push(
        new Paragraph({ children: [new ImageRun({ type: 'jpg', data: logo, transformation: LOGO })] }),
        ...CAMPOS_PORTADA.map(
          (c, j) =>
            new Paragraph({
              spacing: { line: 360, ...(j === 0 ? { before: 3780 } : {}) },
              children: [
                new TextRun({ text: `${c.label}:`, bold: true, size: 28 }),
                ...(portada[c.id]?.trim() ? [new TextRun({ text: ' ', size: 28 }), ...lineas(portada[c.id].trim(), { size: 28 })] : []),
              ],
            }),
        ),
      )
    } else if (hoja.tipo === 'extremos') {
      children.push(titulo(hoja.fotos.length > 1 ? 'Primera y última foto' : 'Foto', salto))
      for (const f of hoja.fotos) children.push(imagen(f), pie(pieFoto(f, true)))
    } else {
      if (hoja.titulo) children.push(titulo(tituloDia(hoja.dia.date), salto))
      if (hoja.cuadro) children.push(cuadro(hoja.texto))
      hoja.fotos.forEach((f, j) => children.push(imagen(f, j === 0 && !hoja.titulo ? salto : {}), pie(pieFoto(f))))
    }
  }

  const doc = new Document({
    creator: sello.name.trim() || 'Sello',
    title: `Reporte ${portada.escuela?.trim() || 'fotográfico'}`,
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } },
        heading2: { run: { font: 'Arial', size: 28, bold: true, color: '2E7D32' }, paragraph: { spacing: { before: 120, after: 160 } } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: HOJA.width * TWIPS, height: HOJA.height * TWIPS },
            margin: { top: HOJA.margin * TWIPS, right: HOJA.margin * TWIPS, bottom: HOJA.margin * TWIPS, left: HOJA.margin * TWIPS },
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}
