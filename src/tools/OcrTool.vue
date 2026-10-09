<script setup>
import { ref, reactive, computed, watch, markRaw } from 'vue'
import DocumentCard from '../components/DocumentCard.vue'
import { CancelledError, extractText, isSupported } from '../lib/ocr.js'

/* ---------- Preferencias ---------- */
const STORAGE_KEY = 'sello:ocr:v1'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const LANGS = [
  { id: 'spa', l: 'Español' },
  { id: 'eng', l: 'Inglés' },
  { id: 'spa+eng', l: 'Ambos' },
]
const lang = ref(LANGS.some((l) => l.id === saved.lang) ? saved.lang : 'spa')
watch(lang, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: lang.value }))
  } catch {}
})

/* ---------- Documentos ---------- */
let uid = 0
const docs = ref([])
const doneDocs = computed(() => docs.value.filter((d) => d.status === 'done'))
const dragging = ref(false)
const toast = ref(null)
const fileInput = ref(null)

let toastTimer
function notify(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}

function addFiles(list) {
  const files = [...list].filter(isSupported)
  if (!files.length) return notify('Sube un PDF o una imagen (JPG, PNG, WebP).')
  if (files.length < list.length) notify('Algunos archivos se omitieron porque no son PDF ni imagen.')
  for (const file of files) {
    docs.value.push({
      id: ++uid,
      file: markRaw(file),
      lang: lang.value,
      status: 'queued',
      step: null,
      page: 0,
      pages: 0,
      progress: 0,
      result: null,
      error: null,
    })
  }
  runQueue()
}

/* Se procesa un documento a la vez: el OCR consume mucha memoria y CPU. */
let running = false
async function runQueue() {
  if (running) return
  running = true
  try {
    let doc
    while ((doc = docs.value.find((d) => d.status === 'queued'))) {
      await processDoc(doc)
    }
  } finally {
    running = false
  }
}

async function processDoc(doc) {
  doc.status = 'working'
  doc.step = 'render'
  try {
    const result = await extractText(doc.file, {
      lang: doc.lang,
      isCancelled: () => !docs.value.includes(doc),
      onStatus: ({ page, pages, step, progress }) => {
        doc.page = page
        doc.pages = pages
        doc.step = step
        // Progreso total: páginas terminadas + avance de la página actual.
        doc.progress = (page - 1 + (step === 'ocr' ? progress : 0)) / pages
      },
    })
    doc.result = markRaw(result)
    doc.status = 'done'
  } catch (e) {
    if (e instanceof CancelledError) return
    console.error(e)
    doc.status = 'error'
    doc.error = describeError(e)
  }
}

function describeError(e) {
  const msg = String(e?.message || e)
  if (e?.name === 'PasswordException') return 'El PDF está protegido con contraseña.'
  if (e?.name === 'InvalidPDFException') return 'El archivo no es un PDF válido o está dañado.'
  if (/decode|EncodingError/i.test(msg) || e?.name === 'EncodingError') return 'Tu navegador no puede abrir esta imagen. Prueba exportándola como JPG.'
  if (/fetch|network|Failed to load|traineddata/i.test(msg)) return 'No se pudo descargar el modelo de idioma. Revisa tu conexión e intenta de nuevo.'
  return 'Algo falló al leer este documento.'
}

function retry(doc) {
  Object.assign(doc, { status: 'queued', lang: lang.value, error: null, progress: 0, step: null })
  runQueue()
}
function removeDoc(id) {
  docs.value = docs.value.filter((d) => d.id !== id)
}
function clearAll() {
  docs.value = []
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

/* ---------- Descargas ---------- */
const baseName = (doc) => doc.file.name.replace(/\.[^.]+$/, '')

function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

function downloadPdf(doc) {
  download(doc.result.pdf, `${baseName(doc)}_texto.pdf`)
}
function downloadTxt(doc) {
  download(new Blob([doc.result.text], { type: 'text/plain;charset=utf-8' }), `${baseName(doc)}.txt`)
}
async function copyText(doc) {
  try {
    await navigator.clipboard.writeText(doc.result.text)
    notify('Texto copiado.')
  } catch {
    notify('No se pudo copiar. Selecciona el texto y cópialo manualmente.')
  }
}
</script>

<template>
  <div
    class="tool ocr"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <main class="layout">
      <!-- ---------- Panel de ajustes ---------- -->
      <aside class="panel">
        <div class="field f-lang">
          <span class="label"><span class="step">01</span>Idioma del documento</span>
          <div class="segmented">
            <button
              v-for="l in LANGS"
              :key="l.id"
              type="button"
              :class="{ active: lang === l.id }"
              :aria-pressed="lang === l.id"
              @click="lang = l.id"
            >{{ l.l }}</button>
          </div>
          <p class="field-note">Elegir el idioma correcto mejora acentos y la letra ñ.</p>
        </div>

        <div class="field f-output">
          <span class="label"><span class="step">02</span>Qué obtienes</span>
          <ul class="outputs">
            <li>
              <span class="out-icon" aria-hidden="true">Aa</span>
              <span><strong>El texto extraído</strong>Para copiarlo o descargarlo como .txt.</span>
            </li>
            <li>
              <span class="out-icon" aria-hidden="true">PDF</span>
              <span><strong>Tu PDF con texto seleccionable</strong>Se ve igual, pero ahora puedes buscar y copiar.</span>
            </li>
          </ul>
          <p class="field-note">
            La primera vez se descarga el modelo de idioma (unos MB); después funciona más rápido. Los PDF que ya tienen texto se leen directo, sin OCR.
          </p>
        </div>
      </aside>

      <!-- ---------- Área de trabajo ---------- -->
      <section class="workspace">
        <label
          class="dropzone"
          :class="{ dragging, compact: docs.length }"
          @keydown.enter.prevent="fileInput.click()"
        >
          <input ref="fileInput" type="file" accept="application/pdf,.pdf,image/*" multiple class="sr-only" @change="onPick" />
          <span class="dz-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zm0 0v5h5M9 13h6M9 17h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="dz-text">
            <strong>{{ docs.length ? 'Agregar más documentos' : 'Suelta tus documentos aquí' }}</strong>
            <span>PDF escaneados o fotos de documentos</span>
          </span>
          <span class="btn btn-primary dz-btn">Subir documentos</span>
        </label>

        <!-- Estado vacío: cómo se ve el resultado -->
        <div v-if="!docs.length" class="demo">
          <div class="demo-frame ocr-demo" aria-hidden="true">
            <div class="paper">
              <span class="ln w90" />
              <span class="ln w70" />
              <span class="ln w80 sel"><em>texto que ya puedes seleccionar</em></span>
              <span class="ln w60" />
              <span class="ln w85" />
              <span class="ln w40" />
            </div>
            <span class="demo-tag">Así queda tu PDF</span>
          </div>
          <ol class="steps">
            <li><b>1</b>Elige el idioma del documento.</li>
            <li><b>2</b>Sube un PDF escaneado o una foto.</li>
            <li><b>3</b>Copia el texto o descarga el PDF con texto.</li>
          </ol>
        </div>

        <template v-else>
          <div class="toolbar">
            <div class="toolbar-info">
              <strong>{{ docs.length }} {{ docs.length === 1 ? 'documento' : 'documentos' }}</strong>
              <span>{{ doneDocs.length }} {{ doneDocs.length === 1 ? 'listo' : 'listos' }}</span>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-ghost" type="button" @click="clearAll">Limpiar</button>
            </div>
          </div>

          <TransitionGroup name="pop" tag="div" class="docs">
            <DocumentCard
              v-for="d in docs"
              :key="d.id"
              :doc="d"
              @remove="removeDoc(d.id)"
              @retry="retry(d)"
              @copy="copyText(d)"
              @txt="downloadTxt(d)"
              @pdf="downloadPdf(d)"
            />
          </TransitionGroup>
        </template>
      </section>
    </main>

    <Transition name="fade">
      <div v-if="dragging" class="drag-overlay" aria-hidden="true">
        <div class="drag-card">Suelta para leer el texto</div>
      </div>
    </Transition>

    <Transition name="sheet">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
