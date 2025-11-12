<script setup lang="ts">
import { createError } from '#app'
import { onBeforeUnmount, onMounted } from 'vue'

interface Door {
  id: number
  name: string
}
interface idAndState {
  id: number
  state: boolean
  name?: string
}
interface ReceivedRecording {
  from: Door['id']
  at: Door['id']
  fromName: string
  time: string
  cacheKey: string
}

const toast = useToast()
const route = useRoute()

const triggerModalState = ref<boolean>(false)
const triggeringDoorId = ref<number | null>(null)

const lastnameFrom = ref<[string, string] | null>(null)

const openCallModal = ref<idAndState>({ id: 0, state: false });
const openRecordModal = ref<idAndState>({ id: 0, state: false });

const receivedRecordings = ref<ReceivedRecording[]>([])
const receivedRecordingsState = ref<boolean>(false)

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
      body: { source: 'dash', customName: deviceName.value }
    })
    toast.add({
      title: '呼び出し完了!',
      description: `${doorName}を呼び出しました。`,
      icon: 'ic:outline-check'
    })
    if (chime) {
      try {
        const chimeInstance = chime.cloneNode(true) as HTMLAudioElement
        void chimeInstance.play()
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
let voice: HTMLAudioElement | null = null
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
      const payload = JSON.parse(evt.data) as { triggeredAt: string; nameFrom?: string; name?: string, type: 'door' | 'dash' | 'record', idFrom: number }
      const timeLabel = formatTime(payload.triggeredAt)
      lastRingAt.value = timeLabel
      console.log('Received door event', payload)
      switch (payload.type) {
        case 'door':
          toast.add({
            title: '呼び出し完了!',
            icon: 'ic:outline-check'
          })
          if (chime) {
            try {
              const chimeInstance = chime.cloneNode(true) as HTMLAudioElement
              void chimeInstance.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
        case 'dash':
          toast.add({
            title: `${payload.nameFrom}から呼び出し`,
            description: `${payload.name}が${timeLabel}に押されました。`,
            icon: 'ic:outline-call-received'
          })
          lastnameFrom.value = [payload.nameFrom ?? '', timeLabel]
          if (ring) {
            try {
              const ringInstance = ring.cloneNode(true) as HTMLAudioElement
              void ringInstance.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
        case 'record': {
          const targetDoorId = currentDoorId
          const cacheKey = payload.triggeredAt
          const existingRecord = receivedRecordings.value.find((record) => record.from === payload.idFrom && record.at === targetDoorId)

          if (existingRecord) {
            existingRecord.time = timeLabel
            existingRecord.cacheKey = cacheKey
          } else {
            receivedRecordings.value.push({ from: payload.idFrom, at: targetDoorId, fromName: payload.nameFrom ?? '', time: timeLabel, cacheKey })
          }

          toast.add({
            title: `録音呼び出し`,
            description: `${payload.nameFrom}から録音が届きました。`,
            icon: 'ic:outline-mic-none'
          })
          if (voice) {
            try {
              const voiceInstance = voice.cloneNode(true) as HTMLAudioElement
              void voiceInstance.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
        }
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
  voice = new Audio('/voice.mp3')
  chime.preload = 'auto'
  ring.preload = 'auto'
  voice.preload = 'auto'
  attachSource()
})

onBeforeUnmount(() => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  detachSource()
})

useHead(() => ({
  link: [
    { rel: 'manifest', href: `/api/doors/manifest/${sanitizedId}` }
  ]
}))
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

    <div class="flex gap-4">
      <UAlert v-if="lastnameFrom" title="呼び出しがありました。"
        :description="lastnameFrom ? `${lastnameFrom[0]}から${lastnameFrom[1]}に呼び出されました。` : ''" close
        close-icon="ic:outline-close" icon="ic:outline-call-missed" variant="outline" color="neutral"
        class="cursor-pointer" @click="lastnameFrom = null" />
      <UAlert v-if="receivedRecordings.length > 0" title="録音が届いています。"
        :description="`受け取った録音が${receivedRecordings.length}件あります。`" icon="ic:outline-mic-none" variant="outline"
        class="cursor-pointer" color="neutral" @click="receivedRecordingsState = true" />
    </div>

    <UButton color="primary"
      class="my-4 w-full h-[50vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
      @click="triggerDoor()" size="xl" v-if="rawId != '0'">
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
      <div v-else-if="otherDoors.length === 0" class="text-center text-neutral-500">
        <UButton color="primary" variant="solid" icon="ic:outline-call-made" block
          @click="triggerModalState = false; openRecordModal.state = true; openRecordModal.id = 0" v-if="rawId != '0'">
          ダッシュボード
        </UButton>
      </div>
      <div v-else class="space-y-3">
        <UButton v-for="door in otherDoors" :key="door.id" color="neutral" variant="solid" block
          :loading="triggeringDoorId === door.id" icon="ic:outline-call-made"
          @click="openCallModal.id = door.id; openCallModal.name = door.name; openCallModal.state = true; triggerModalState = false">
          {{ door.name }}
        </UButton>
        <UButton color="primary" variant="solid" icon="ic:outline-call-made" block
          @click="triggerModalState = false; openRecordModal.state = true; openRecordModal.id = 0" v-if="rawId != '0'">
          ダッシュボード
        </UButton>
      </div>
    </template>
    <template #footer>
      <UButton color="primary" @click="triggerModalState = false;" icon="ic:outline-clear">キャンセル
      </UButton>
    </template>
  </UModal>

  <UModal v-model:open="receivedRecordingsState" title="受け取った録音">
    <template #body>
      <div v-if="receivedRecordings.length === 0" class="py-4 text-center text-neutral-500">
        受け取った録音はありません。
      </div>
      <div v-else class="space-y-4">
        <div v-for="record in receivedRecordings" :key="`${record.from}-${record.at}-${record.cacheKey}`"
          class="p-4 border border-neutral-200 rounded-lg">
          <Player :from="record.from" :to="record.at" :nameFrom="record.fromName" :version="record.cacheKey" />
          <p class="mt-2 text-sm text-neutral-500">受信時間: {{ record.time }}</p>
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="openCallModal.state" title="呼ぶ">
    <template #body>
      <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="triggerOtherDoor(openCallModal.id, openCallModal.name || 'Unknown'); openCallModal.state = false; openCallModal.id = 0">
        <p class="text-center">普通に呼ぶ</p>
      </UButton>
      <USeparator class="my-4" label="or" />
      <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="openRecordModal.state = true; openRecordModal.id = openCallModal.id; openCallModal.state = false; openCallModal.id = 0">
        <p class="text-center">録音を送信</p>
      </UButton>
    </template>
    <template #footer>
      <UButton color="primary"
        @click="openCallModal.state = false; openCallModal.id = 0; openCallModal.name = undefined"
        icon="ic:outline-clear">キャンセル
      </UButton>
    </template>
  </UModal>

  <UModal v-model:open="openRecordModal.state" title="録音">
    <template #body>
      <Recorder :from="currentDoorId" :to="openRecordModal.id" :nameFrom="deviceName"
        @sent="openRecordModal.state = false; openRecordModal.id = 0" />
    </template>
    <template #footer>
      <UButton color="error" @click="openRecordModal.state = false; openRecordModal.id = 0" icon="ic:outline-clear">
        キャンセル
      </UButton>
    </template>
  </UModal>
</template>
