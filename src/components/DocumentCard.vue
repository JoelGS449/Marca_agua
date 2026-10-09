<script setup>
import { computed } from 'vue'

const props = defineProps({
  doc: { type: Object, required: true },
})
const emit = defineEmits(['remove', 'retry', 'copy', 'txt', 'textpdf', 'pdf'])

const STEPS = {
  render: 'Preparando página',
  model: 'Descargando modelo de idioma',
  ocr: 'Leyendo texto',
}

const status = computed(() => {
  const d = props.doc
  if (d.status === 'queued') return 'En espera'
  if (d.status === 'working') {
    const step = STEPS[d.step] ?? 'Procesando'
    return d.pages > 1 ? `${step} · página ${d.page} de ${d.pages}` : step
  }
  return ''
})

const summary = computed(() => {
  const r = props.doc.result
  if (!r) return ''
  const pages = `${r.pages} ${r.pages === 1 ? 'página' : 'páginas'}`
  if (!r.ocrPages) return `${pages} · ya tenía texto`
  const native = r.pages - r.ocrPages
  return native ? `${pages} · ${r.ocrPages} con OCR` : pages
})

const quality = computed(() => {
  const c = props.doc.result?.confidence
  if (c == null) return null
  if (c >= 85) return { cls: 'good', label: `Confianza ${Math.round(c)}%`, title: 'El texto se reconoció con buena precisión.' }
  if (c >= 60) return { cls: 'fair', label: `Confianza ${Math.round(c)}%`, title: 'Revisa el texto: puede tener algunos errores.' }
  return { cls: 'low', label: `Confianza ${Math.round(c)}%`, title: 'La imagen es poco nítida; el texto puede tener muchos errores.' }
})

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
</script>

<template>
  <article class="doc" :class="doc.status">
    <header class="doc-head">
      <div class="doc-thumb">
        <img v-if="doc.result?.thumb" :src="doc.result.thumb" alt="" />
        <span v-else class="doc-thumb-ph" aria-hidden="true">{{ /\.pdf$/i.test(doc.file.name) ? 'PDF' : 'IMG' }}</span>
      </div>
      <div class="doc-info">
        <strong class="doc-name" :title="doc.file.name">{{ doc.file.name }}</strong>
        <span class="doc-meta">
          <template v-if="doc.status === 'done'">{{ summary }}</template>
          <template v-else>{{ kb(doc.file.size) }}</template>
        </span>
        <span v-if="quality" class="badge" :class="quality.cls" :title="quality.title"><i />{{ quality.label }}</span>
      </div>
      <button class="doc-remove" type="button" :aria-label="`Quitar ${doc.file.name}`" @click="emit('remove')">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </header>

    <div v-if="doc.status === 'queued' || doc.status === 'working'" class="doc-progress">
      <div class="doc-progress-head">
        <span><span v-if="doc.status === 'working'" class="spinner" aria-hidden="true" />{{ status }}</span>
        <output v-if="doc.status === 'working'">{{ Math.round(doc.progress * 100) }}%</output>
      </div>
      <div class="bar" role="progressbar" :aria-valuenow="Math.round(doc.progress * 100)" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ transform: `scaleX(${doc.progress})` }" />
      </div>
    </div>

    <div v-else-if="doc.status === 'error'" class="doc-error">
      <span>{{ doc.error }}</span>
      <button class="btn btn-ghost btn-sm" type="button" @click="emit('retry')">Reintentar</button>
    </div>

    <template v-else-if="doc.status === 'done'">
      <textarea
        v-if="doc.result.text"
        class="doc-text"
        :value="doc.result.text"
        readonly
        spellcheck="false"
        :aria-label="`Texto extraído de ${doc.file.name}`"
      />
      <p v-else class="doc-empty">No se encontró texto. Si es una foto, intenta con una imagen más nítida y bien iluminada.</p>

      <footer class="doc-actions">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!doc.result.text" @click="emit('copy')">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 9h10v10H9zM5 15V5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
          Copiar
        </button>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!doc.result.text" @click="emit('txt')">.txt</button>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!doc.result.text" title="PDF que contiene solo el texto extraído" @click="emit('textpdf')">Texto .pdf</button>
        <button class="btn btn-primary btn-sm" type="button" @click="emit('pdf')">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          PDF con texto
        </button>
      </footer>
    </template>
  </article>
</template>
