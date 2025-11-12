<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  htmlAttrs: {
    lang: 'ja'
  }
})

if (process.client) {
  let cleanup: (() => void) | null = null

  const requestFullscreen = async () => {
    const el = document.documentElement

    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      return
    }

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen()
      }
    } catch (error) {
      console.warn('Failed to enter fullscreen:', error)
    }
  }

  onMounted(() => {
    const handler = () => {
      requestFullscreen()
    }

    document.addEventListener('pointerdown', handler, { passive: true })
    cleanup = () => {
      document.removeEventListener('pointerdown', handler)
    }
  })

  onBeforeUnmount(() => {
    cleanup?.()
  })
}
</script>

<template>
  <UApp>
    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
