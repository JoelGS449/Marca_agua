import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Rutas relativas para que funcione en GitHub Pages sin importar el nombre del repo
  base: './',
})
