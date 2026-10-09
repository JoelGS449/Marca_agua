<script setup>
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import WatermarkTool from './tools/WatermarkTool.vue'

/*
 * Actividades disponibles. Para agregar una nueva:
 * crea su componente en src/tools/ y agrega una entrada aquí.
 */
const TOOLS = [
  {
    id: 'marca',
    label: 'Marca de agua',
    component: WatermarkTool,
    foot: ['Sello — hecho para quien olvida qué día fue.', 'Las fotos exportadas son JPG en alta calidad.'],
  },
  {
    id: 'ocr',
    label: 'Texto de documentos',
    short: 'OCR',
    // Se carga solo al abrirla: el motor de OCR y el lector de PDF pesan bastante.
    component: defineAsyncComponent(() => import('./tools/OcrTool.vue')),
    foot: ['Sello — para no volver a transcribir a mano.', 'El reconocimiento de texto funciona mejor con escaneos nítidos.'],
  },
]

const fromHash = () => TOOLS.find((t) => `#/${t.id}` === location.hash)?.id ?? TOOLS[0].id
const activeId = ref(fromHash())
const active = computed(() => TOOLS.find((t) => t.id === activeId.value))

const onHash = () => (activeId.value = fromHash())
onMounted(() => addEventListener('hashchange', onHash))
onBeforeUnmount(() => removeEventListener('hashchange', onHash))
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <span class="brand-name">Sello</span>
      </div>

      <nav class="tabs" aria-label="Actividades">
        <a
          v-for="t in TOOLS"
          :key="t.id"
          class="tab"
          :class="{ active: t.id === activeId }"
          :href="`#/${t.id}`"
          :aria-current="t.id === activeId ? 'page' : undefined"
        >
          <span class="tab-long">{{ t.label }}</span>
          <span class="tab-short">{{ t.short ?? t.label }}</span>
        </a>
      </nav>

      <p class="topbar-note">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
        <span class="note-long">Tus archivos nunca salen de tu dispositivo</span>
        <span class="note-short">100% privado</span>
      </p>
    </header>

    <!-- KeepAlive conserva las fotos y documentos al cambiar de actividad -->
    <KeepAlive>
      <component :is="active.component" :key="active.id" />
    </KeepAlive>

    <footer class="foot">
      <span v-for="line in active.foot" :key="line">{{ line }}</span>
    </footer>
  </div>
</template>
