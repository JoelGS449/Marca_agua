<script setup>
import { ref, computed, watch, markRaw } from 'vue'
import PhotoCard from '../components/PhotoCard.vue'
import { readTakenDate } from '../lib/exif.js'
import { sello } from '../lib/preferencias.js'
import { cronologico, crearReporte } from '../lib/reporte.js'
import { fontsReady, makePreview, withImage } from '../lib/watermark.js'

const STYLE_LABELS = { editorial: 'Editorial', film: 'Rollo', glass: 'Cápsula', frame: 'Marco' }

/* ---------- Título (se recuerda en este navegador) ---------- */
const STORAGE_KEY = 'sello:reporte:v1'
const titulo = ref(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY))?.titulo ?? ''
    } catch {
      return ''
    }
  })(),
)
watch(titulo, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ titulo: titulo.value }))
  } catch {}
})

/* ---------- Fotos ---------- */
let uid = 0
const photos = ref([])
const readyPhotos = computed(() => photos.value.filter((p) => p.status === 'ready'))
// Las que aún cargan o fallaron van al final; las listas, por fecha.
const ordered = computed(() => [...cronologico(readyPhotos.value), ...photos.value.filter((p) => p.status !== 'ready')])
const sinExif = computed(() => readyPhotos.value.filter((p) => p.source === 'file').length)
const loading = computed(() => photos.value.some((p) => p.status === 'loading'))
const dragging = ref(false)
const progress = ref(null)
const toast = ref(null)
const fileInput = ref(null)

let toastTimer
function notify(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}

function tagFor(p) {
  const list = readyPhotos.value
  if (p.status !== 'ready' || !list.length) return ''
  const i = ordered.value.indexOf(p)
  if (list.length > 1 && i === 0) return 'Primera'
  if (list.length > 1 && i === list.length - 1) return 'Última'
  return `#${i + 1}`
}

async function addFiles(list) {
  const files = [...list].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f.name))
  if (!files.length) return notify('Ninguno de esos archivos parece ser una imagen.')
  await fontsReady
  for (const file of files) {
    photos.value.push({ id: ++uid, file: markRaw(file), status: 'loading', date: null, source: null, preview: null })
    const p = photos.value[photos.value.length - 1]
    // Vista previa más chica que en Marca de agua: aquí suelen ser muchas fotos.
    Promise.all([readTakenDate(file), withImage(file, (img) => makePreview(img, 900))])
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

/* ---------- Documento ---------- */
function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const fileName = () => {
  const base = (titulo.value.trim() || 'Reporte fotográfico').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)
  const d = new Date()
  return `${base} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.docx`
}

async function generar() {
  const list = readyPhotos.value
  if (!list.length) return
  progress.value = { done: 0, total: list.length }
  try {
    const blob = await crearReporte({
      photos: list,
      titulo: titulo.value,
      sello,
      onProgress: (done) => (progress.value.done = done),
    })
    download(blob, fileName())
  } catch (e) {
    console.error(e)
    notify('No se pudo crear el documento. Intenta con menos fotos a la vez.')
  } finally {
    progress.value = null
  }
}
</script>

<template>
  <div
    class="tool"
    :class="{ 'has-bar': readyPhotos.length }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <main class="layout">
      <!-- ---------- Panel de ajustes ---------- -->
      <aside class="panel">
        <div class="field f-title">
          <label class="label" for="titulo"><span class="step">01</span>Título del reporte</label>
          <input
            id="titulo"
            v-model="titulo"
            class="name-input"
            type="text"
            placeholder="Reporte fotográfico"
            maxlength="80"
          />
        </div>

        <div class="field f-seal">
          <span class="label"><span class="step">02</span>Sello</span>
          <p class="seal-summary">
            <strong>{{ sello.name.trim() || 'Sin nombre' }}</strong>
            <span>Estilo {{ STYLE_LABELS[sello.settings.style] ?? sello.settings.style }} · con fecha{{ sello.settings.showTime ? ' y hora' : '' }}</span>
          </p>
          <p class="field-note">
            Se usa el mismo sello que configuraste en
            <a href="#/marca">Marca de agua</a>.<template v-if="!sello.name.trim()"> Escribe ahí tu nombre para que aparezca en las fotos.</template>
          </p>
        </div>

        <div class="field f-structure">
          <span class="label"><span class="step">03</span>Cómo queda el documento</span>
          <ul class="outputs">
            <li>
              <span class="out-icon" aria-hidden="true">1</span>
              <span><strong>Primera hoja</strong>La primera y la última foto, con el rango de fechas.</span>
            </li>
            <li>
              <span class="out-icon" aria-hidden="true">2+</span>
              <span><strong>Registro cronológico</strong>Las demás fotos de la más antigua a la más reciente, dos por hoja.</span>
            </li>
          </ul>
          <p class="field-note">Se descarga como Word (.docx). Para abrirlo en Google Docs, súbelo a Google Drive y ábrelo con Documentos de Google.</p>
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
            <strong>{{ photos.length ? 'Agregar más fotos' : 'Suelta todas las fotos aquí' }}</strong>
            <span>Se ordenan solas por la fecha en que se tomaron</span>
          </span>
          <span class="btn btn-primary dz-btn">Elegir fotos</span>
        </label>

        <div v-if="!photos.length" class="demo">
          <ol class="steps">
            <li><b>1</b>Configura tu nombre y estilo en Marca de agua.</li>
            <li><b>2</b>Sube todas las fotos: se ordenan por su fecha.</li>
            <li><b>3</b>Revisa el orden y descarga el reporte en Word.</li>
          </ol>
        </div>

        <template v-else>
          <div class="toolbar">
            <div class="toolbar-info">
              <strong>{{ photos.length }} {{ photos.length === 1 ? 'foto' : 'fotos' }}</strong>
              <span v-if="sinExif" class="warn-text">{{ sinExif }} sin fecha de cámara: revisa su fecha, define el orden</span>
              <span v-else-if="readyPhotos.length">En orden cronológico</span>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" type="button" @click="clearAll">Limpiar</button>
              <button class="btn btn-primary" type="button" :disabled="!readyPhotos.length || loading || !!progress" @click="generar">
                <span v-if="progress" class="spinner" aria-hidden="true" />
                {{ progress ? `Preparando ${progress.done}/${progress.total}` : 'Descargar Word' }}
              </button>
            </div>
          </div>

          <TransitionGroup name="pop" tag="div" class="grid">
            <PhotoCard
              v-for="p in ordered"
              :key="p.id"
              :photo="p"
              :settings="sello.settings"
              :name="sello.name"
              :tag="tagFor(p)"
              :savable="false"
              @remove="removePhoto(p.id)"
              @date="(d) => { p.date = d; p.source = 'manual' }"
            />
          </TransitionGroup>
        </template>
      </section>
    </main>

    <!-- Barra fija en móvil -->
    <Transition name="fade">
      <div v-if="readyPhotos.length" class="mobile-bar">
        <span>{{ readyPhotos.length }} {{ readyPhotos.length === 1 ? 'foto' : 'fotos' }}</span>
        <button class="btn btn-primary" type="button" :disabled="loading || !!progress" @click="generar">
          <span v-if="progress" class="spinner" aria-hidden="true" />
          {{ progress ? `${progress.done}/${progress.total}` : 'Descargar Word' }}
        </button>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="dragging" class="drag-overlay" aria-hidden="true">
        <div class="drag-card">Suelta para agregar al reporte</div>
      </div>
    </Transition>

    <Transition name="sheet">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
