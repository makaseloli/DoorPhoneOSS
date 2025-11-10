<script setup lang="ts">
import { createError } from '#app'
import { onBeforeUnmount, onMounted } from 'vue'

interface Door {
  id: number
  name: string
}
const toast = useToast()
const route = useRoute()

const triggerModalState = ref<boolean>(false)
const triggeringDoorId = ref<number | null>(null)

const lastTriggeredFrom = ref<[string, string] | null>(null)

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

const {
  data: doors,
  pending: doorsPending,
  refresh: refreshDoors
} = useFetch<Door[]>(`/api/doors`, {
  server: false,
  lazy: true,
  default: () => []
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusMessage ?? 'Failed to load door data',
  })
}

const currentDoorId = Number.parseInt(sanitizedId, 10)

const deviceName = computed(() => device.value?.name ?? 'ドアホン')
const otherDoors = computed(() => (doors.value ?? []).filter((door) => door.id !== currentDoorId))

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

const triggerOtherDoor = async (doorId: number, doorName: string) => {
  if (triggeringDoorId.value) return
  try {
    triggeringDoorId.value = doorId
    await $fetch(`/api/doors/${doorId}/press`, {
      method: 'POST',
      body: { source: 'dash', customName: deviceName.value}
    })
    toast.add({
      title: '呼び出し完了!',
      description: `${doorName}を呼び出しました。`,
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
    triggerModalState.value = false
  } catch (error) {
    console.error('Failed to trigger door', error)
    toast.add({
      title: '呼び出し失敗',
      icon: 'ic:outline-error-outline',
      color: 'error'
    })
  } finally {
    triggeringDoorId.value = null
  }
}

const openTriggerModal = async () => {
  try {
    await refreshDoors()
  } catch (error) {
    console.error('Failed to load doors', error)
  }
  triggerModalState.value = true
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
      const payload = JSON.parse(evt.data) as { triggeredAt: string; triggeredFrom?: string; name?: string, type: 'door' | 'dash' }
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
            title: `${payload.triggeredFrom}から呼び出し`,
            description: `${payload.name}が${timeLabel}に押されました。`,
            icon: 'ic:outline-call-received'
          })
          lastTriggeredFrom.value = [payload.triggeredFrom ?? '', timeLabel]
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
  <UHeader>
    <template #left>
      <h1 class="font-bold">{{ deviceName }}</h1>
      <UBadge color="neutral" variant="outline">{{ currentTime }}</UBadge>
    </template>
    <template #right>
      <UBadge color="neutral">ID: {{ rawId }}</UBadge>
      <UBadge v-if="lastRingAt" color="primary">最終呼び出し: {{ lastRingAt }}</UBadge>
      <UColorModeButton />
    </template>
  </UHeader>
  <UContainer class="mt-8 mx-auto max-w-[800px]">
    <UAlert v-if="lastTriggeredFrom" title="呼び出しがありました。" :description="lastTriggeredFrom ? `${lastTriggeredFrom[0]}から${lastTriggeredFrom[1]}に呼び出されました。` : ''" close close-icon="ic:outline-close" variant="outline" @click="lastTriggeredFrom = null" />
    <UButton color="primary"
      class="my-4 w-full h-[50vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
      @click="triggerDoor()" size="xl">
      <p class="text-center">呼ぶ</p>
    </UButton>
    <UButton color="neutral"
      class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
      @click="openTriggerModal()" size="xl">
      <p class="text-center">他の部屋を呼ぶ</p>
    </UButton>
  </UContainer>

  <UModal v-model:open="triggerModalState" title="どの部屋を呼びますか?">
    <template #body>
      <div v-if="doorsPending" class="py-4 text-center text-neutral-500">
        <UProgress color="neutral" animation="swing" />
      </div>
      <div v-else-if="otherDoors.length === 0" class="py-4 text-center text-neutral-500">
        他の部屋は登録されていません。
      </div>
      <div v-else class="space-y-3">
        <UButton v-for="door in otherDoors" :key="door.id" color="neutral" variant="solid" block
          :loading="triggeringDoorId === door.id" icon="ic:outline-call-made"
          @click="triggerOtherDoor(door.id, door.name)">
          {{ door.name }}
        </UButton>
      </div>
    </template>
    <template #footer>
      <UButton color="primary" @click="triggerModalState = false;" icon="ic:outline-clear">キャンセル
      </UButton>
    </template>
  </UModal>
</template>
