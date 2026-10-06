<script setup>
import { ref, watchPostEffect, onBeforeUnmount } from 'vue'
import { renderWatermark, toLocalInput } from '../lib/watermark.js'

const props = defineProps({
  photo: { type: Object, required: true },
  settings: { type: Object, required: true },
  name: { type: String, default: '' },
  busy: Boolean,
})
const emit = defineEmits(['remove', 'save', 'date'])

const SOURCES = {
  exif: { label: 'EXIF', title: 'Fecha leída de los metadatos de la cámara' },
  file: { label: 'Sin EXIF', title: 'La foto no trae fecha en sus metadatos; se usó la fecha del archivo. Puedes corregirla.' },
  manual: { label: 'Editada', title: 'Fecha ajustada manualmente' },
}

const canvas = ref(null)
let raf = 0

watchPostEffect(() => {
  const p = props.photo
  const opts = { ...props.settings, name: props.name, date: p.date }
  if (p.status !== 'ready' || !canvas.value) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => canvas.value && renderWatermark(canvas.value, p.preview, opts))
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

function onDate(e) {
  const d = new Date(e.target.value)
  if (!Number.isNaN(d.getTime())) emit('date', d)
}
</script>

<template>
  <article class="card" :class="photo.status">
    <div class="card-media">
      <canvas v-show="photo.status === 'ready'" ref="canvas" />
      <div v-if="photo.status === 'loading'" class="card-skeleton">
        <span class="spinner" aria-hidden="true" />
        <span>Leyendo metadatos…</span>
      </div>
      <div v-else-if="photo.status === 'error'" class="card-error">
        <strong>No se pudo abrir</strong>
        <small>{{ photo.file.name }}</small>
        <small>Prueba exportándola como JPG.</small>
      </div>
      <button class="card-remove" type="button" aria-label="Quitar foto" @click="emit('remove')">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
    </div>

    <footer v-if="photo.status === 'ready'" class="card-foot">
      <div class="card-meta">
        <span
          class="badge"
          :class="photo.source"
          :title="SOURCES[photo.source].title"
        >
          <i />{{ SOURCES[photo.source].label }}
        </span>
        <input
          class="date-input"
          type="datetime-local"
          :value="toLocalInput(photo.date)"
          aria-label="Fecha y hora de la foto"
          @change="onDate"
        />
      </div>
      <button class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="emit('save')">
        <span v-if="busy" class="spinner" aria-hidden="true" />
        <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {{ busy ? 'Procesando' : 'Guardar' }}
      </button>
    </footer>
  </article>
</template>
