<script setup>
import { ref, reactive, computed, watch, markRaw } from 'vue'
import PhotoCard from '../components/PhotoCard.vue'
import ReportPreview from '../components/ReportPreview.vue'
import { readTakenDate } from '../lib/exif.js'
import { sello } from '../lib/preferencias.js'
import { CAMPOS_PORTADA, crearReporte, cronologico, paginar, porDia, rangoFechas, tituloDia } from '../lib/reporte.js'
import { fontsReady, makePreview, withImage } from '../lib/watermark.js'

const STYLE_LABELS = { editorial: 'Editorial', film: 'Rollo', glass: 'Cápsula', frame: 'Marco' }

/* ---------- Portada (se recuerda en este navegador, salvo la fecha) ---------- */
const STORAGE_KEY = 'sello:reporte:v2'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()
const portada = reactive(Object.fromEntries(CAMPOS_PORTADA.map((c) => [c.id, c.id === 'fecha' ? '' : (saved[c.id] ?? '')])))
watch(portada, () => {
  try {
    const { fecha, ...resto } = portada
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resto))
  } catch {}
})

/* ---------- Fotos ---------- */
let uid = 0
const photos = ref([])
const readyPhotos = computed(() => photos.value.filter((p) => p.status === 'ready'))
const orden = computed(() => cronologico(readyPhotos.value))
const dias = computed(() => porDia(orden.value))
const pendientes = computed(() => photos.value.filter((p) => p.status !== 'ready'))
const sinExif = computed(() => readyPhotos.value.filter((p) => p.source === 'file').length)
const loading = computed(() => photos.value.some((p) => p.status === 'loading'))
const textos = reactive({})
const dragging = ref(false)
const progress = ref(null)
const toast = ref(null)
const fileInput = ref(null)

const rango = computed(() => rangoFechas(orden.value))
// Si la fecha de la portada se deja vacía, se usa el rango de las fotos.
const portadaFinal = computed(() => ({ ...portada, fecha: portada.fecha.trim() || rango.value }))

let toastTimer
function notify(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}

function tagFor(p) {
  const n = orden.value.length
  const i = orden.value.indexOf(p)
  if (n > 1 && i === 0) return 'Primera'
  if (n > 1 && i === n - 1) return 'Última'
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
  for (const k in textos) delete textos[k]
}

/* ---------- Vista previa y documento ---------- */
const previewOpen = ref(false)
const hojas = computed(() => (previewOpen.value ? paginar({ photos: readyPhotos.value, textos, sello }) : []))

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
  const base = `Reporte ${portada.escuela.trim() || 'fotográfico'}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)
  const d = orden.value[0]?.date ?? new Date()
  return `${base} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.docx`
}

async function generar() {
  const list = readyPhotos.value
  if (!list.length) return
  progress.value = { done: 0, total: list.length }
  try {
    const blob = await crearReporte({
      photos: list,
      portada: portadaFinal.value,
      textos,
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
        <div class="field f-cover">
          <span class="label"><span class="step">01</span>Portada</span>
          <div class="cover-form">
            <label v-for="c in CAMPOS_PORTADA" :key="c.id" class="cover-field">
              <span>{{ c.multiline ? 'Valor, objetivo o factor de riesgo de la semana' : c.label.charAt(0) + c.label.slice(1).toLowerCase() }}</span>
              <textarea v-if="c.multiline" v-model="portada[c.id]" class="form-input" rows="3" />
              <input
                v-else
                v-model="portada[c.id]"
                class="form-input"
                :placeholder="c.id === 'fecha' ? rango || 'Se toma de las fotos' : ''"
              />
            </label>
          </div>
          <p class="field-note">Si dejas la fecha vacía se usa el rango de las fotos. Los demás datos se recuerdan para la próxima semana.</p>
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
              <span><strong>Portada</strong>Con los datos de arriba.</span>
            </li>
            <li>
              <span class="out-icon" aria-hidden="true">2</span>
              <span><strong>Primera y última foto</strong>Las dos puntas de la semana.</span>
            </li>
            <li>
              <span class="out-icon" aria-hidden="true">3+</span>
              <span><strong>Un apartado por día</strong>Su cuadro de texto y sus fotos en orden.</span>
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
            <span>Se ordenan y agrupan por día solas</span>
          </span>
          <span class="btn btn-primary dz-btn">Elegir fotos</span>
        </label>

        <div v-if="!photos.length" class="demo">
          <ol class="steps">
            <li><b>1</b>Llena los datos de la portada.</li>
            <li><b>2</b>Sube todas las fotos: se agrupan por día.</li>
            <li><b>3</b>Escribe el texto de cada día, revisa la vista previa y descarga.</li>
          </ol>
        </div>

        <template v-else>
          <div class="toolbar">
            <div class="toolbar-info">
              <strong>
                {{ photos.length }} {{ photos.length === 1 ? 'foto' : 'fotos' }}<template v-if="dias.length">
                  · {{ dias.length }} {{ dias.length === 1 ? 'día' : 'días' }}</template>
              </strong>
              <span v-if="sinExif" class="warn-text">{{ sinExif }} sin fecha de cámara: revisa su fecha, define el orden</span>
              <span v-else-if="readyPhotos.length">En orden cronológico</span>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" type="button" @click="clearAll">Limpiar</button>
              <button class="btn btn-primary" type="button" :disabled="!readyPhotos.length || loading" @click="previewOpen = true">
                Vista previa
              </button>
            </div>
          </div>

          <div class="day-groups">
            <section v-for="dia in dias" :key="dia.key" class="day">
              <header class="day-head">
                <h3>{{ tituloDia(dia.date) }}</h3>
                <span>{{ dia.photos.length }} {{ dia.photos.length === 1 ? 'foto' : 'fotos' }}</span>
              </header>
              <label class="day-text">
                <span class="sr-only">Texto del {{ tituloDia(dia.date) }}</span>
                <textarea
                  v-model="textos[dia.key]"
                  class="form-input"
                  rows="3"
                  placeholder="Texto de este día (aparece en un cuadro arriba de sus fotos; puedes cambiarlo después en el documento)"
                />
              </label>
              <TransitionGroup name="pop" tag="div" class="grid">
                <PhotoCard
                  v-for="p in dia.photos"
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
            </section>

            <div v-if="pendientes.length" class="grid">
              <PhotoCard
                v-for="p in pendientes"
                :key="p.id"
                :photo="p"
                :settings="sello.settings"
                :name="sello.name"
                :savable="false"
                @remove="removePhoto(p.id)"
              />
            </div>
          </div>
        </template>
      </section>
    </main>

    <!-- Barra fija en móvil -->
    <Transition name="fade">
      <div v-if="readyPhotos.length && !previewOpen" class="mobile-bar">
        <span>{{ readyPhotos.length }} {{ readyPhotos.length === 1 ? 'foto' : 'fotos' }}</span>
        <button class="btn btn-primary" type="button" :disabled="loading" @click="previewOpen = true">Vista previa</button>
      </div>
    </Transition>

    <ReportPreview
      v-if="previewOpen"
      :hojas="hojas"
      :portada="portadaFinal"
      :sello="sello"
      :progress="progress"
      @close="previewOpen = false"
      @download="generar"
    />

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
