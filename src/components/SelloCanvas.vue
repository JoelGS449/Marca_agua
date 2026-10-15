<script setup>
import { ref, watchPostEffect, onBeforeUnmount } from 'vue'
import { renderWatermark } from '../lib/watermark.js'

/** La vista previa de una foto con su sello, sin controles. */
const props = defineProps({
  photo: { type: Object, required: true },
  sello: { type: Object, required: true },
})

const canvas = ref(null)
let raf = 0
watchPostEffect(() => {
  const opts = { ...props.sello.settings, name: props.sello.name, date: props.photo.date }
  const src = props.photo.preview
  if (!canvas.value || !src) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => canvas.value && renderWatermark(canvas.value, src, opts))
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas ref="canvas" />
</template>
