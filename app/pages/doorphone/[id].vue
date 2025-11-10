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

const { data: device, error, pending } = await useFetch<Door>(`/api/doors/${sanitizedId}`, {
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

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

const triggerDoor = async () => {
  try {
    await $fetch(`/api/doors/${sanitizedId}/press`, {
      method: 'POST',
      body: { source: 'door' }
    })
  } catch (error) {
    console.error('Failed to trigger door', error)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null
let chime: HTMLAudioElement | null = null
let ring: HTMLAudioElement | null = null
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0

const updateTime = () => {
  currentTime.value = formatTime(new Date().toISOString())
}

const detachSource = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const scheduleReconnect = () => {
  if (reconnectTimer) return
  reconnectAttempt += 1
  const delay = Math.min(30000, 1000 * 2 ** (reconnectAttempt - 1))
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    attachSource()
  }, delay)
}

const attachSource = () => {
  if (eventSource) return
  const source = new EventSource(`/api/doors/${sanitizedId}/events`)
  reconnectAttempt = 0
  source.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data) as { triggeredAt: string; name?: string, type: 'door' | 'dash' }
      const timeLabel = formatTime(payload.triggeredAt)
      lastRingAt.value = timeLabel

      switch (payload.type) {
        case 'door':
          toast.add({
            title: '呼び出し完了!',
            icon: 'ic:outline-check'
          })
          if (chime) {
            try {
              chime.currentTime = 0
              void chime.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
        case 'dash':
          toast.add({
            title: '呼び出し',
            description: `${payload.name}が${timeLabel}に押されました。`,
            icon: 'ic:outline-call-received'
          })
          if (ring) {
            try {
              ring.currentTime = 0
              void ring.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
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
  source.onopen = () => {
    reconnectAttempt = 0
  }
  source.onerror = (error) => {
    console.error('Door events stream error', sanitizedId, error)
    detachSource()
    scheduleReconnect()
  }
  eventSource = source
}

onMounted(() => {
  updateTime()
  intervalId = setInterval(() => {
    updateTime()
  }, 1000)
  chime = new Audio('/push.mp3')
  ring = new Audio('/ring.mp3')
  chime.preload = 'auto'
  ring.preload = 'auto'
  attachSource()
})

onBeforeUnmount(() => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  detachSource()
})
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
