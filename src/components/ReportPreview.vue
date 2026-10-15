<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import SelloCanvas from './SelloCanvas.vue'
import logoUrl from '../assets/portada-logo.jpg'
import { CAMPOS_PORTADA, HOJA, pieFoto, tituloDia } from '../lib/reporte.js'

const props = defineProps({
  hojas: { type: Array, required: true },
  portada: { type: Object, required: true },
  sello: { type: Object, required: true },
  progress: { type: Object, default: null },
})
const emit = defineEmits(['close', 'download'])

// Las hojas se dibujan en unidades de su propio ancho (cqw), así la proporción es la del Word.
const px = (n) => `calc(${n} * var(--px))`
const pageVars = { '--px': `${100 / HOJA.width}cqw`, '--margin': px(HOJA.margin) }
const total = computed(() => props.hojas.length)

const onKey = (e) => e.key === 'Escape' && !props.progress && emit('close')
onMounted(() => {
  addEventListener('keydown', onKey)
  document.documentElement.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  removeEventListener('keydown', onKey)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <div class="preview" role="dialog" aria-modal="true" aria-labelledby="preview-title">
    <header class="preview-bar">
      <div class="preview-head">
        <h2 id="preview-title">Vista previa</h2>
        <span>{{ total }} {{ total === 1 ? 'hoja' : 'hojas' }} · podrás editarlo en Word o Google Docs</span>
      </div>
      <div class="preview-actions">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="!!progress" @click="emit('close')">Seguir editando</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="!!progress" @click="emit('download')">
          <span v-if="progress" class="spinner" aria-hidden="true" />
          {{ progress ? `Preparando ${progress.done}/${progress.total}` : 'Descargar Word' }}
        </button>
      </div>
    </header>

    <div class="preview-scroll">
      <article v-for="(hoja, i) in hojas" :key="i" class="rpage" :style="pageVars">
        <div class="rpage-body">
          <template v-if="hoja.tipo === 'portada'">
            <img class="rpage-logo" :src="logoUrl" alt="" :style="{ width: px(568) }" />
            <div class="rpage-fields">
              <p v-for="c in CAMPOS_PORTADA" :key="c.id">
                <b>{{ c.label }}:</b> {{ portada[c.id]?.trim() }}
              </p>
            </div>
          </template>

          <template v-else-if="hoja.tipo === 'extremos'">
            <h3 class="rpage-h">{{ hoja.fotos.length > 1 ? 'Primera y última foto' : 'Foto' }}</h3>
            <figure v-for="f in hoja.fotos" :key="f.photo.id" class="rpage-photo">
              <SelloCanvas :photo="f.photo" :sello="sello" :style="{ width: px(f.size.width), height: px(f.size.height) }" />
              <figcaption>{{ pieFoto(f, true) }}</figcaption>
            </figure>
          </template>

          <template v-else>
            <h3 v-if="hoja.titulo" class="rpage-h">{{ tituloDia(hoja.dia.date) }}</h3>
            <div v-if="hoja.cuadro" class="rpage-box" :class="{ empty: !hoja.texto.trim() }">
              {{ hoja.texto.trim() || 'Cuadro de texto: escribe aquí o en el documento.' }}
            </div>
            <figure v-for="f in hoja.fotos" :key="f.photo.id" class="rpage-photo">
              <SelloCanvas :photo="f.photo" :sello="sello" :style="{ width: px(f.size.width), height: px(f.size.height) }" />
              <figcaption>{{ pieFoto(f) }}</figcaption>
            </figure>
          </template>
        </div>
        <span class="rpage-num">{{ i + 1 }}</span>
      </article>
    </div>
  </div>
</template>
