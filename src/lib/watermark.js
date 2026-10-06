const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const pad = (n) => String(n).padStart(2, '0')

const FONT = {
  serif: '"Instrument Serif", Georgia, serif',
  sans: 'Geist, system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  stamp: 'VT323, "Geist Mono", monospace',
}

/** Las fuentes deben estar cargadas antes de dibujar en el canvas. */
export const fontsReady = (async () => {
  if (!document.fonts?.load) return
  await Promise.all(
    [
      `italic 400 48px ${FONT.serif}`,
      `400 48px ${FONT.serif}`,
      `600 48px ${FONT.sans}`,
      `500 48px ${FONT.mono}`,
      `400 48px ${FONT.stamp}`,
    ].map((f) => document.fonts.load(f).catch(() => {})),
  )
})()

export function formatDate(d, format = 'long', withTime = false) {
  if (!d) return ''
  let s
  switch (format) {
    case 'numeric':
      s = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      break
    case 'film':
      s = `'${String(d.getFullYear()).slice(-2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`
      break
    default:
      s = `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }
  return withTime ? `${s}  ${pad(d.getHours())}:${pad(d.getMinutes())}` : s
}

/** Date -> valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Carga un archivo como <img> (respeta la orientación EXIF) y libera la URL al terminar. */
export async function withImage(file, fn) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return await fn(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Copia reducida para previsualizar rápido sin cargar la foto completa en cada cambio. */
export function makePreview(img, maxSide = 1400) {
  const { w, h } = fit(img, { maxSide })
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return c
}

function fit(src, { maxSide = 0, maxPixels = 0 } = {}) {
  const sw = src.naturalWidth || src.width
  const sh = src.naturalHeight || src.height
  let k = 1
  if (maxSide) k = Math.min(k, maxSide / Math.max(sw, sh))
  if (maxPixels) k = Math.min(k, Math.sqrt(maxPixels / (sw * sh)))
  return { w: Math.round(sw * k), h: Math.round(sh * k) }
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function setSpacing(ctx, px = 0) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

function measure(ctx, line) {
  ctx.font = line.font
  setSpacing(ctx, line.spacing)
  return ctx.measureText(line.text).width
}

function anchor(pos, W, H, bw, bh, m) {
  const x = pos.endsWith('l') ? m : pos.endsWith('r') ? W - m - bw : (W - bw) / 2
  const y = pos.startsWith('t') ? m : H - m - bh
  return { x, y }
}

/**
 * Dibuja la foto con la marca de agua en `canvas`.
 * opts: { name, date, style, position, scale, opacity, color, dateFormat, showTime }
 */
export function renderWatermark(canvas, src, opts, limits = {}) {
  const { w, h } = fit(src, limits)
  const base = Math.min(w, h)
  const u = base * 0.036 * (opts.scale || 1)
  const name = (opts.name || '').trim()
  const date = formatDate(opts.date, opts.dateFormat, opts.showTime)
  const color = opts.color || '#fdf8f0'
  const light = luminance(color) > 0.35
  const ctx = canvas.getContext('2d')

  if (opts.style === 'frame') return drawFrame(canvas, ctx, src, { w, h, base, u, name, date, color, light, opts })

  canvas.width = w
  canvas.height = h
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  if (!name && !date) return canvas

  const m = base * 0.045
  const pos = opts.position || 'br'
  ctx.save()
  ctx.globalAlpha = opts.opacity ?? 1

  if (opts.style === 'glass') {
    drawPill(ctx, { W: w, H: h, u, m, pos, name, date, color, light })
  } else {
    const film = opts.style === 'film'
    const lines = (
      film
        ? [
            { text: name.toUpperCase(), font: `400 ${u * 1.15}px ${FONT.stamp}`, size: u * 1.15, lh: 1, spacing: u * 0.08 },
            { text: date, font: `400 ${u * 1.9}px ${FONT.stamp}`, size: u * 1.9, lh: 0.95, spacing: u * 0.1 },
          ]
        : [
            { text: name, font: `italic 400 ${u * 1.75}px ${FONT.serif}`, size: u * 1.75, lh: 1.08 },
            { text: date.toUpperCase(), font: `500 ${u * 0.66}px ${FONT.mono}`, size: u * 0.66, lh: 1.5, spacing: u * 0.16, alpha: 0.88 },
          ]
    ).filter((l) => l.text)

    const bw = Math.max(...lines.map((l) => (l.w = measure(ctx, l))))
    const bh = lines.reduce((s, l) => s + l.size * l.lh, 0)
    const { x, y } = anchor(pos, w, h, bw, bh, m)
    const align = pos.endsWith('l') ? 'left' : pos.endsWith('r') ? 'right' : 'center'
    const tx = align === 'left' ? x : align === 'right' ? x + bw : x + bw / 2

    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = color
    let ty = y
    for (const l of lines) {
      const lineH = l.size * l.lh
      const baseline = ty + lineH * 0.5 + l.size * 0.33
      ctx.font = l.font
      setSpacing(ctx, l.spacing)
      const a = (opts.opacity ?? 1) * (l.alpha ?? 1)
      if (film) {
        // Resplandor de fechador de película
        ctx.globalAlpha = a
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = u * 0.15
        ctx.shadowOffsetY = u * 0.05
        ctx.fillText(l.text, tx, baseline)
        ctx.shadowOffsetY = 0
        ctx.shadowColor = color
        ctx.shadowBlur = u * 0.7
        ctx.globalAlpha = a * 0.85
        ctx.fillText(l.text, tx, baseline)
      } else {
        ctx.globalAlpha = a
        ctx.shadowColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.45)'
        ctx.shadowBlur = u * 0.6
        ctx.shadowOffsetY = u * 0.05
        ctx.fillText(l.text, tx, baseline)
      }
      ty += lineH
    }
  }
  ctx.restore()
  return canvas
}

function drawPill(ctx, { W, H, u, m, pos, name, date, color, light }) {
  const fs = u * 0.8
  const padX = fs * 1.05
  const gap = fs * 0.75
  const dotR = fs * 0.24
  const nameLine = { text: name, font: `600 ${fs}px ${FONT.sans}`, spacing: -fs * 0.01 }
  const dateLine = { text: date.toUpperCase(), font: `500 ${fs * 0.82}px ${FONT.mono}`, spacing: fs * 0.06 }
  const nw = name ? measure(ctx, nameLine) : 0
  const dw = date ? measure(ctx, dateLine) : 0
  const sep = name && date ? gap * 2 + 1 : 0
  const bw = padX + dotR * 2 + gap * 0.8 + nw + sep + dw + padX
  const bh = fs * 2.3
  const { x, y } = anchor(pos, W, H, bw, bh, m)
  const cy = y + bh / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = u * 0.8
  ctx.shadowOffsetY = u * 0.15
  ctx.fillStyle = light ? 'rgba(45,38,56,0.45)' : 'rgba(253,248,240,0.75)'
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(x, y, bw, bh, bh / 2) : ctx.rect(x, y, bw, bh)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'
  ctx.lineWidth = Math.max(1, u * 0.04)
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(x, y, bw, bh, bh / 2) : ctx.rect(x, y, bw, bh)
  ctx.stroke()

  let cx = x + padX
  ctx.fillStyle = '#ff9ec0'
  ctx.beginPath()
  ctx.arc(cx + dotR, cy, dotR, 0, Math.PI * 2)
  ctx.fill()
  cx += dotR * 2 + gap * 0.8

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  if (name) {
    ctx.font = nameLine.font
    setSpacing(ctx, nameLine.spacing)
    ctx.fillText(name, cx, cy + fs * 0.04)
    cx += nw
  }
  if (sep) {
    ctx.globalAlpha *= 0.35
    ctx.fillRect(cx + gap, cy - fs * 0.5, Math.max(1, u * 0.04), fs)
    ctx.globalAlpha /= 0.35
    cx += sep
  }
  if (date) {
    ctx.font = dateLine.font
    setSpacing(ctx, dateLine.spacing)
    ctx.fillText(dateLine.text, cx, cy + fs * 0.04)
  }
}

function drawFrame(canvas, ctx, src, { w, h, base, u, name, date, color, light, opts }) {
  const b = Math.round(base * 0.04)
  const bar = Math.round(u * 2.6 + b * 1.6)
  canvas.width = w + b * 2
  canvas.height = h + b + bar
  ctx.fillStyle = light ? '#2d2638' : '#fdf8f0'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, b, b, w, h)

  const cy = h + b + bar / 2
  ctx.globalAlpha = opts.opacity ?? 1
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  if (name) {
    ctx.textAlign = 'left'
    ctx.font = `italic 400 ${u * 1.5}px ${FONT.serif}`
    setSpacing(ctx, 0)
    ctx.fillText(name, b, cy)
  }
  if (date) {
    ctx.textAlign = name ? 'right' : 'center'
    ctx.font = `500 ${u * 0.58}px ${FONT.mono}`
    setSpacing(ctx, u * 0.14)
    ctx.fillText(date.toUpperCase(), name ? b + w : canvas.width / 2, cy)
  }
  ctx.globalAlpha = 1
  return canvas
}

/** Escena ilustrada para la vista previa antes de subir fotos. */
export function makeDemoSource(w = 1500, h = 1000) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.68)
  sky.addColorStop(0, '#b9cdfb')
  sky.addColorStop(0.45, '#e6c3ee')
  sky.addColorStop(0.8, '#ffc9bd')
  sky.addColorStop(1, '#ffe6c9')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const sun = ctx.createRadialGradient(w * 0.62, h * 0.6, 0, w * 0.62, h * 0.6, h * 0.42)
  sun.addColorStop(0, 'rgba(255,250,235,1)')
  sun.addColorStop(0.18, 'rgba(255,240,215,0.95)')
  sun.addColorStop(0.22, 'rgba(255,215,200,0.5)')
  sun.addColorStop(1, 'rgba(255,200,190,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)

  const hill = (yBase, amp, freq, phase, fill) => {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 10) {
      const y = yBase + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 2) * amp * 0.35
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }
  hill(h * 0.66, h * 0.05, 0.004, 1.2, '#d2b0de')
  hill(h * 0.74, h * 0.06, 0.003, 3.1, '#a993cf')
  hill(h * 0.86, h * 0.05, 0.005, 0.4, '#6f61a0')

  // Grano sutil
  const img = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  return c
}
