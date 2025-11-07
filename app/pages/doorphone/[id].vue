<script setup lang="ts">
import { createError } from '#app'
import { onBeforeUnmount, onMounted } from 'vue'

interface Door {
  id: number
  name: string
}
const toast = useToast()
const route = useRoute()

const rawId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
const sanitizedId = rawId?.toString().trim() ?? ''

if (!/^\d+$/.test(sanitizedId)) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid door id',
  })
}

const { data: device, error, pending } = await useFetch<Door>(`/api/devices/${sanitizedId}`, {
  key: `door-${sanitizedId}`,
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusMessage ?? 'Failed to load door data',
  })
}

const deviceName = computed(() => device.value?.name ?? 'ドアホン')

const currentTime = ref<string>('--:--:--')
const lastRingAt = ref<string | null>(null)

const triggerDoor = async () => {
  try {
    await $fetch(`/api/devices/${sanitizedId}/press`, { method: 'POST' })
  } catch (error) {
    console.error('Failed to trigger door', error)
  }
}

if (!import.meta.env.SSR) {
  const updateTime = () => {
    currentTime.value = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  updateTime()
  const intervalId = setInterval(updateTime, 1000)
  const chime = new Audio('/push.mp3')
  chime.preload = 'auto'
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0

  const cleanupEventSource = () => {
    eventSource?.close()
    eventSource = null
  }

  const scheduleReconnect = () => {
    const attempt = reconnectAttempt + 1
    reconnectAttempt = attempt
    const delay = Math.min(30000, 1000 * 2 ** (attempt - 1))
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectEvents()
    }, delay)
  }

  const connectEvents = () => {
    cleanupEventSource()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    eventSource = new EventSource(`/api/devices/${sanitizedId}/events`)
    eventSource.onopen = () => {
      reconnectAttempt = 0
    }
    eventSource.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data) as { triggeredAt: string }
        lastRingAt.value = new Date(payload.triggeredAt).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        toast.add({
          title: '呼び出し完了!',
          icon: 'ic:outline-check'
        })
        try {
          chime.currentTime = 0
          void chime.play()
        } catch (playError) {
          console.warn('Audio playback blocked', playError)
        }
      } catch (error) {
        console.warn('Received non-JSON event payload', evt.data, error)
        toast.add({
          title: '呼び出し失敗',
          icon: 'ic:outline-error-outline',
          color: 'error'
        })
      }
    }
    eventSource.onerror = (error) => {
      console.error('Door events stream error', sanitizedId, error)
      cleanupEventSource()
      scheduleReconnect()
    }
  }

  onMounted(() => {
    connectEvents()
  })

  onBeforeUnmount(() => {
    clearInterval(intervalId)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    cleanupEventSource()
  })
}
</script>

<template>
  <UHeader :title="deviceName">
    <template #right>
      <UBadge color="neutral">ID: {{ rawId }}</UBadge>
      <UBadge v-if="lastRingAt" color="primary">最終呼び出し: {{ lastRingAt }}</UBadge>
      <UColorModeButton />
    </template>
  </UHeader>
  <UContainer class="mt-8 mx-auto max-w-[800px]">
    <UPageCTA :title="currentTime" />
    <UButton color="primary"
      class="my-4 w-full h-[50vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
      @click="triggerDoor()" size="xl">
      <p class="text-center">呼ぶ</p>
    </UButton>
  </UContainer>
</template>
