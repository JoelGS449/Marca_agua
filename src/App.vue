<script setup>
import { ref, reactive, computed, watch, watchPostEffect, onMounted, markRaw } from 'vue'
import JSZip from 'jszip'
import PhotoCard from './components/PhotoCard.vue'
import { readTakenDate } from './lib/exif.js'
import { fontsReady, formatDate, makeDemoSource, makePreview, renderWatermark, withImage } from './lib/watermark.js'

/* ---------- Preferencias (se recuerdan en este navegador) ---------- */
const STORAGE_KEY = 'sello:v2'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const name = ref(saved.name ?? '')
const settings = reactive({
  style: 'editorial',
  position: 'br',
  scale: 1,
  opacity: 0.95,
  color: '#fdf8f0',
  dateFormat: 'long',
  showTime: true,
  ...saved.settings,
})
watch(
  [name, settings],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: name.value, settings }))
    } catch {}
  },
  { deep: true },
)

const STYLES = [
  { id: 'editorial', label: 'Editorial', hint: 'Serif con firma', preset: { color: '#fdf8f0', dateFormat: 'long' } },
  { id: 'film', label: 'Rollo', hint: 'Fechador de película', preset: { color: '#ff7a1a', dateFormat: 'film' } },
  { id: 'glass', label: 'Cápsula', hint: 'Etiqueta flotante', preset: { color: '#fdf8f0', dateFormat: 'long' } },
  { id: 'frame', label: 'Marco', hint: 'Borde instantánea', preset: { color: '#2d2638', dateFormat: 'long' } },
]
const POSITIONS = [
  { id: 'tl', label: 'Arriba izquierda' },
  { id: 'tc', label: 'Arriba centro' },
  { id: 'tr', label: 'Arriba derecha' },
  { id: 'bl', label: 'Abajo izquierda' },
  { id: 'bc', label: 'Abajo centro' },
  { id: 'br', label: 'Abajo derecha' },
]
const COLORS = [
  { v: '#fdf8f0', l: 'Marfil' },
  { v: '#2d2638', l: 'Tinta' },
  { v: '#ffc4d6', l: 'Rosa' },
  { v: '#d6c8ff', l: 'Lavanda' },
  { v: '#bff0d4', l: 'Menta' },
  { v: '#ff7a1a', l: 'Ámbar' },
]
const today = new Date()
const FORMATS = ['long', 'numeric', 'film'].map((id) => ({ id, l: formatDate(today, id) }))

function selectStyle(s) {
  if (settings.style === s.id) return
  settings.style = s.id
  Object.assign(settings, s.preset)
}

/* ---------- Fotos ---------- */
let uid = 0
const photos = ref([])
const readyPhotos = computed(() => photos.value.filter((p) => p.status === 'ready'))
const exifCount = computed(() => readyPhotos.value.filter((p) => p.source === 'exif').length)
const dragging = ref(false)
const busyId = ref(null)
const progress = ref(null)
const pending = ref(null)
const toast = ref(null)
const fileInput = ref(null)

let toastTimer
function notify(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}

async function addFiles(list) {
  const files = [...list].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f.name))
  if (!files.length) return notify('Ninguno de esos archivos parece ser una imagen.')
  await fontsReady
  for (const file of files) {
    photos.value.push({ id: ++uid, file: markRaw(file), status: 'loading', date: null, source: null, preview: null })
    const p = photos.value[photos.value.length - 1]
    Promise.all([readTakenDate(file), withImage(file, (img) => makePreview(img))])
      .then(([meta, preview]) => {
        p.date = meta.date
        p.source = meta.source
        p.preview = markRaw(preview)
        p.status = 'ready'
      })
      .catch(() => (p.status = 'error'))
  }
}

function onPick(e) {
  addFiles(e.target.files)
  e.target.value = ''
}
let dragDepth = 0
function onDragEnter(e) {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(e) {
  dragDepth = 0
  dragging.value = false
  addFiles(e.dataTransfer.files)
}
function removePhoto(id) {
  photos.value = photos.value.filter((p) => p.id !== id)
}
function clearAll() {
  photos.value = []
}

/* ---------- Exportación ---------- */
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const outName = (p) => `${p.file.name.replace(/\.[^.]+$/, '')}_sello.jpg`

async function exportPhoto(p) {
  const blob = await withImage(p.file, (img) => {
    const c = document.createElement('canvas')
    // Límite de píxeles para que Safari en iPhone no falle con fotos de 48 MP
    renderWatermark(c, img, { ...settings, name: name.value, date: p.date }, { maxPixels: 14_000_000 })
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.93))
  })
  return new File([blob], outName(p), { type: 'image/jpeg' })
}

function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

async function share(files) {
  try {
    await navigator.share({ files })
    pending.value = null
  } catch (e) {
    if (e?.name === 'NotAllowedError') pending.value = files // el gesto expiró: pedimos un toque más
    else if (e?.name !== 'AbortError') throw e
  }
}

async function deliver(files) {
  if (isTouch && navigator.canShare?.({ files })) return share(files)
  if (files.length === 1) return download(files[0], files[0].name)
  const zip = new JSZip()
  const used = new Set()
  files.forEach((f) => {
    let n = f.name
    for (let i = 2; used.has(n); i++) n = f.name.replace(/\.jpg$/, `_${i}.jpg`)
    used.add(n)
    zip.file(n, f)
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  download(blob, `sello_${formatDate(new Date(), 'numeric').replaceAll('/', '-')}.zip`)
}

async function saveOne(p) {
  busyId.value = p.id
  try {
    await deliver([await exportPhoto(p)])
  } catch {
    notify('No se pudo exportar esa foto.')
  } finally {
    busyId.value = null
  }
}

async function saveAll() {
  const list = readyPhotos.value
  if (!list.length) return
  progress.value = { done: 0, total: list.length }
  try {
    const files = []
    for (const p of list) {
      files.push(await exportPhoto(p))
      progress.value.done++
    }
    await deliver(files)
  } catch {
    notify('Algo falló al exportar. Intenta con menos fotos a la vez.')
  } finally {
    progress.value = null
  }
}

/* ---------- Vista previa de ejemplo ---------- */
const demoCanvas = ref(null)
const demoSource = ref(null)
const demoDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 42)
onMounted(async () => {
  await fontsReady
  demoSource.value = markRaw(makeDemoSource())
})
watchPostEffect(() => {
  const opts = { ...settings, name: name.value || 'Tu nombre', date: demoDate }
  if (demoCanvas.value && demoSource.value) renderWatermark(demoCanvas.value, demoSource.value, opts)
})
</script>

<template>
  <div
    class="app"
    :class="{ 'has-photos': readyPhotos.length }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <span class="brand-name">Sello</span>
      </div>
      <p class="topbar-note">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
        <span class="note-long">Tus fotos nunca salen de tu dispositivo</span>
        <span class="note-short">100% privado</span>
      </p>
    </header>

    <section class="hero">
      <p class="eyebrow">Marca de agua · fecha original · nombre</p>
      <h1>Firma cada foto con <em>el momento exacto</em> en que la tomaste.</h1>
      <p class="lede">
        Leemos la fecha y hora guardadas en los metadatos de la cámara y las estampamos junto a tu nombre.
        Sin subir nada a ningún servidor.
      </p>
    </section>

    <main class="layout">
      <!-- ---------- Panel de ajustes ---------- -->
      <aside class="panel">
        <div class="field f-name">
          <label class="label" for="name"><span class="step">01</span>Tu nombre</label>
          <input
            id="name"
            v-model="name"
            class="name-input"
            type="text"
            placeholder="Escribe tu nombre"
            autocomplete="name"
            maxlength="48"
          />
        </div>

        <div class="field f-style">
          <span class="label"><span class="step">02</span>Estilo</span>
          <div class="styles">
            <button
              v-for="s in STYLES"
              :key="s.id"
              type="button"
              class="style-card"
              :class="[`is-${s.id}`, { active: settings.style === s.id }]"
              :aria-pressed="settings.style === s.id"
              @click="selectStyle(s)"
            >
              <span class="style-swatch" aria-hidden="true">
                <span class="sw-name">{{ (name || 'Ana').split(' ')[0] }}</span>
                <span class="sw-date">{{ s.id === 'film' ? "'26 10 05" : '05 OCT' }}</span>
              </span>
              <span class="style-label">{{ s.label }}</span>
              <span class="style-hint">{{ s.hint }}</span>
            </button>
          </div>
        </div>

        <div class="field f-pos" :class="{ disabled: settings.style === 'frame' }">
          <span class="label"><span class="step">03</span>Posición</span>
          <div class="pos-wrap">
            <div class="pos-grid" role="radiogroup" aria-label="Posición de la marca">
              <button
                v-for="p in POSITIONS"
                :key="p.id"
                type="button"
                role="radio"
                class="pos-dot"
                :class="{ active: settings.position === p.id }"
                :aria-checked="settings.position === p.id"
                :aria-label="p.label"
                :disabled="settings.style === 'frame'"
                @click="settings.position = p.id"
              ><i /></button>
            </div>
            <p class="pos-note">
              {{ settings.style === 'frame' ? 'En Marco el texto va en el borde inferior.' : POSITIONS.find((p) => p.id === settings.position)?.label }}
            </p>
          </div>
        </div>

        <div class="field f-adjust">
          <span class="label"><span class="step">04</span>Ajustes</span>

          <div class="control">
            <div class="control-head"><span>Tamaño</span><output>{{ Math.round(settings.scale * 100) }}%</output></div>
            <input v-model.number="settings.scale" type="range" min="0.5" max="2" step="0.05" aria-label="Tamaño" />
          </div>

          <div class="control">
            <div class="control-head"><span>Opacidad</span><output>{{ Math.round(settings.opacity * 100) }}%</output></div>
            <input v-model.number="settings.opacity" type="range" min="0.3" max="1" step="0.05" aria-label="Opacidad" />
          </div>

          <div class="control">
            <div class="control-head"><span>Color</span></div>
            <div class="swatches">
              <button
                v-for="c in COLORS"
                :key="c.v"
                type="button"
                class="swatch"
                :class="{ active: settings.color === c.v }"
                :style="{ '--c': c.v }"
                :aria-label="c.l"
                :title="c.l"
                @click="settings.color = c.v"
              />
              <label class="swatch swatch-custom" :class="{ active: !COLORS.some((c) => c.v === settings.color) }" title="Personalizado">
                <input v-model="settings.color" type="color" aria-label="Color personalizado" />
              </label>
            </div>
          </div>

          <div class="control">
            <div class="control-head"><span>Formato de fecha</span></div>
            <div class="segmented">
              <button
                v-for="f in FORMATS"
                :key="f.id"
                type="button"
                :class="{ active: settings.dateFormat === f.id }"
                @click="settings.dateFormat = f.id"
              >{{ f.l }}</button>
            </div>
          </div>

          <label class="toggle">
            <input v-model="settings.showTime" type="checkbox" />
            <span class="toggle-track"><span class="toggle-thumb" /></span>
            Incluir hora
          </label>
        </div>
      </aside>

      <!-- ---------- Área de trabajo ---------- -->
      <section class="workspace">
        <label
          class="dropzone"
          :class="{ dragging, compact: photos.length }"
          @keydown.enter.prevent="fileInput.click()"
        >
          <input ref="fileInput" type="file" accept="image/*" multiple class="sr-only" @change="onPick" />
          <span class="dz-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="dz-text">
            <strong>{{ photos.length ? 'Agregar más fotos' : 'Suelta tus fotos aquí' }}</strong>
            <span>Toca para elegirlas de tu galería</span>
          </span>
          <span class="btn btn-primary dz-btn">Elegir fotos</span>
        </label>

        <!-- Estado vacío: vista previa en vivo -->
        <div v-if="!photos.length" class="demo">
          <div class="demo-frame">
            <canvas ref="demoCanvas" />
            <span class="demo-tag">Vista previa en vivo</span>
          </div>
          <ol class="steps">
            <li><b>1</b>Escribe tu nombre y elige un estilo.</li>
            <li><b>2</b>Sube tus fotos: la fecha sale de sus metadatos.</li>
            <li><b>3</b>Revisa, corrige si hace falta y guarda.</li>
          </ol>
        </div>

        <template v-else>
          <div class="toolbar">
            <div class="toolbar-info">
              <strong>{{ photos.length }} {{ photos.length === 1 ? 'foto' : 'fotos' }}</strong>
              <span v-if="readyPhotos.length">{{ exifCount }} con fecha EXIF</span>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" type="button" @click="clearAll">Limpiar</button>
              <button class="btn btn-primary" type="button" :disabled="!readyPhotos.length || !!progress" @click="saveAll">
                <span v-if="progress" class="spinner" aria-hidden="true" />
                {{ progress ? `Procesando ${progress.done}/${progress.total}` : isTouch ? 'Guardar todas' : 'Descargar todas' }}
              </button>
            </div>
          </div>

          <TransitionGroup name="pop" tag="div" class="grid">
            <PhotoCard
              v-for="p in photos"
              :key="p.id"
              :photo="p"
              :settings="settings"
              :name="name"
              :busy="busyId === p.id"
              @remove="removePhoto(p.id)"
              @save="saveOne(p)"
              @date="(d) => { p.date = d; p.source = 'manual' }"
            />
          </TransitionGroup>
        </template>
      </section>
    </main>

    <!-- Barra fija en móvil -->
    <Transition name="fade">
      <div v-if="readyPhotos.length && !pending" class="mobile-bar">
        <span>{{ readyPhotos.length }} {{ readyPhotos.length === 1 ? 'foto' : 'fotos' }}</span>
        <button class="btn btn-primary" type="button" :disabled="!!progress" @click="saveAll">
          <span v-if="progress" class="spinner" aria-hidden="true" />
          {{ progress ? `${progress.done}/${progress.total}` : isTouch ? 'Guardar todas' : 'Descargar todas' }}
        </button>
      </div>
    </Transition>

    <footer class="foot">
      <span>Sello — hecho para quien olvida qué día fue.</span>
      <span>Las fotos exportadas son JPG en alta calidad.</span>
    </footer>

    <!-- Overlay de arrastre -->
    <Transition name="fade">
      <div v-if="dragging" class="drag-overlay" aria-hidden="true">
        <div class="drag-card">Suelta para estampar</div>
      </div>
    </Transition>

    <!-- iOS: si el gesto expiró, pedimos un toque para abrir "Guardar imagen" -->
    <Transition name="sheet">
      <div v-if="pending" class="sheet">
        <p>{{ pending.length }} {{ pending.length === 1 ? 'foto lista' : 'fotos listas' }}</p>
        <button class="btn btn-primary" type="button" @click="share(pending)">Guardar en Fotos</button>
        <button class="btn btn-ghost" type="button" @click="pending = null">Cancelar</button>
      </div>
    </Transition>

    <Transition name="sheet">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
