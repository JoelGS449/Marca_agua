import { reactive, watch } from 'vue'

/*
 * Configuración del sello compartida entre pestañas: lo que se ajusta en
 * "Marca de agua" es lo que usa el reporte. Se recuerda en este navegador.
 */
const STORAGE_KEY = 'sello:v2'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

export const sello = reactive({
  name: saved.name ?? '',
  settings: {
    style: 'editorial',
    position: 'br',
    scale: 1,
    opacity: 0.95,
    color: '#fdf8f0',
    dateFormat: 'long',
    showTime: true,
    ...saved.settings,
  },
})

watch(
  sello,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sello))
    } catch {}
  },
  { deep: true },
)
