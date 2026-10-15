<script setup>
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import WatermarkTool from './tools/WatermarkTool.vue'
import LoginView from './views/LoginView.vue'
import { sesion, cerrarSesion, restaurarSesion } from './lib/auth'

/*
 * Actividades disponibles. Para agregar una nueva:
 * crea su componente en src/tools/, agrega una entrada aquí y da de alta
 * una Herramienta con el mismo slug en el admin de Django.
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
  {
    id: 'reporte',
    label: 'Reporte fotográfico',
    short: 'Reporte',
    // La librería de Word solo se descarga al generar el documento.
    component: defineAsyncComponent(() => import('./tools/ReportTool.vue')),
    foot: ['Sello — tus fotos en orden, listas para entregar.', 'El documento se abre en Word y en Google Docs.'],
  },
]

// Solo las herramientas que el perfil del usuario tiene permitidas.
const tools = computed(() => TOOLS.filter((t) => sesion.usuario?.herramientas.includes(t.id)))

const hash = ref(location.hash)
const active = computed(() => tools.value.find((t) => `#/${t.id}` === hash.value) ?? tools.value[0])
const activeId = computed(() => active.value?.id)

const onHash = () => (hash.value = location.hash)
onMounted(() => {
  addEventListener('hashchange', onHash)
  restaurarSesion()
})
onBeforeUnmount(() => removeEventListener('hashchange', onHash))
</script>

<template>
  <div v-if="!sesion.lista" class="login-loading"><span class="spinner" aria-label="Cargando" /></div>

  <div v-else-if="!sesion.usuario" class="app">
    <LoginView />
  </div>

  <div v-else class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <span class="brand-name">Sello</span>
      </div>

      <nav class="tabs" aria-label="Actividades">
        <a
          v-for="t in tools"
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

      <div class="user-menu">
        <span class="user-name">
          {{ sesion.usuario.nombre }}
          <small v-if="sesion.usuario.perfil">{{ sesion.usuario.perfil }}</small>
        </span>
        <button class="btn btn-ghost btn-sm" @click="cerrarSesion">Salir</button>
      </div>
    </header>

    <p v-if="!active" class="empty-tools">
      Tu perfil todavía no tiene herramientas asignadas. Pide acceso a quien administra Sello.
    </p>


    <!-- KeepAlive conserva las fotos y documentos al cambiar de actividad -->
    <KeepAlive>
      <component :is="active.component" v-if="active" :key="active.id" />
    </KeepAlive>

    <footer v-if="active" class="foot">
      <span v-for="line in active.foot" :key="line">{{ line }}</span>
    </footer>
  </div>
</template>
