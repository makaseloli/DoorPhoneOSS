<script setup lang="ts">
interface Door {
  id: number
  name: string
}
interface idAndState {
  id: number
  state: boolean
}
interface ReceivedRecording {
  from: Door['id']
  at: Door['id']
  fromName: string
  time: string
  cacheKey: string
}

const toast = useToast()

const door_name = ref<string>("");
const isSubmitting = ref<boolean>(false);

const receivedRecordings = ref<ReceivedRecording[]>([])
const receivedRecordingsState = ref<boolean>(false)
const DASHBOARD_DOOR_ID = 0
const selectedRecordingDoorId = ref<number | null>(null)

const AreYouDelete = ref<idAndState>({ id: 0, state: false });
const openCallModal = ref<idAndState>({ id: 0, state: false });
const openRecordModal = ref<idAndState>({ id: 0, state: false });
const openAddModal = ref<boolean>(false);

const { data: doors, refresh: refreshDoors } = useFetch<Door[]>('/api/doors', {
  server: false,
  lazy: true,
  default: () => [],
});

const lastTriggers = reactive<Record<number, string>>({})
const sources = new Map<number, EventSource>()
const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>()
const reconnectAttempts = new Map<number, number>()
let chime: HTMLAudioElement | null = null
let ring: HTMLAudioElement | null = null
let voice: HTMLAudioElement | null = null
let stopDoorsWatch: (() => void) | null = null

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const triggerDoor = async (doorId: number) => {
  try {
    await $fetch(`/api/doors/${doorId}/press`, {
      method: 'POST',
      body: { source: 'dash', customName: 'ダッシュボード' }
    })
  } catch (error) {
    console.error('Failed to trigger door', error)
  }
}

const isDoorFormValid = computed(() => {
  const name = door_name.value.trim();

  return name.length > 0;
});

const doorItems = computed(() => doors.value ?? []);
const hasDoors = computed(() => doorItems.value.length > 0);

const recordingLookup = computed(() => {
  return receivedRecordings.value.reduce<Record<number, ReceivedRecording>>((acc, record) => {
    acc[record.from] = record
    return acc
  }, {})
})

const modalRecordings = computed(() => {
  if (selectedRecordingDoorId.value === null) return []
  return receivedRecordings.value.filter((record) => record.from === selectedRecordingDoorId.value)
})

const selectedDoorName = computed(() => {
  if (selectedRecordingDoorId.value === null) return ''
  return doorItems.value.find((door) => door.id === selectedRecordingDoorId.value)?.name ?? `ID ${selectedRecordingDoorId.value}`
})

const modalTitle = computed(() => {
  if (!selectedDoorName.value) return '受け取った録音'
  return `${selectedDoorName.value}からの録音`
})

const hasRecordingForDoor = (doorId: number) => Boolean(recordingLookup.value[doorId])

const handleRecordsBadgeClick = (doorId: number) => {
  selectedRecordingDoorId.value = doorId
  receivedRecordingsState.value = true
}

const detachSource = (doorId: number) => {
  sources.get(doorId)?.close()
  sources.delete(doorId)
  delete lastTriggers[doorId]
  reconnectAttempts.delete(doorId)
  const timer = reconnectTimers.get(doorId)
  if (timer) {
    clearTimeout(timer)
    reconnectTimers.delete(doorId)
  }
}

const detachAllSources = () => {
  for (const id of Array.from(sources.keys())) detachSource(id)
}

const scheduleReconnect = (doorId: number) => {
  const nextAttempt = (reconnectAttempts.get(doorId) ?? 0) + 1
  reconnectAttempts.set(doorId, nextAttempt)
  const delay = Math.min(30000, 1000 * 2 ** (nextAttempt - 1))
  const timer = setTimeout(() => {
    reconnectTimers.delete(doorId)
    attachSource(doorId)
  }, delay)
  reconnectTimers.set(doorId, timer)
}

const attachSource = (doorId: number) => {
  if (sources.has(doorId)) return
  const source = new EventSource(`/api/doors/${doorId}/events`)
  reconnectAttempts.set(doorId, 0)
  source.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data) as { triggeredAt: string; nameFrom?: string; name?: string; type: 'door' | 'dash' | 'record'; idFrom: number }
      const timeLabel = formatTime(payload.triggeredAt)

      switch (payload.type) {
        case 'door': {
          lastTriggers[doorId] = timeLabel
          const doorName = payload.name ?? doorItems.value.find((door) => door.id === doorId)?.name ?? `ID ${doorId}`
          toast.add({
            title: '呼び出し',
            description: `${doorName}が${timeLabel}に押されました。`,
            icon: 'ic:outline-call-received'
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
        }
        case 'dash': {
          toast.add({
            title: '呼び出し完了!',
            description: `${payload.name}を呼び出しました。`,
            icon: 'ic:outline-check'
          })
          if (ring) {
            try {
              const ringInstance = ring.cloneNode(true) as HTMLAudioElement
              void ringInstance.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }
          break
        }
        case 'record': {
          if (doorId !== DASHBOARD_DOOR_ID) break
          const targetDoorId = doorId
          const cacheKey = payload.triggeredAt
          const existingRecord = receivedRecordings.value.find((record) => record.from === payload.idFrom && record.at === targetDoorId)

          if (existingRecord) {
            existingRecord.time = timeLabel
            existingRecord.cacheKey = cacheKey
            existingRecord.fromName = payload.nameFrom ?? ''
          } else {
            receivedRecordings.value.push({
              from: payload.idFrom,
              at: targetDoorId,
              fromName: payload.nameFrom ?? '',
              time: timeLabel,
              cacheKey
            })
          }

          if (voice) {
            try {
              const voiceInstance = voice.cloneNode(true) as HTMLAudioElement
              void voiceInstance.play()
            } catch (playError) {
              console.warn('Audio playback blocked', playError)
            }
          }

          toast.add({
            title: '録音呼び出し',
            description: `${payload.nameFrom ?? '不明'}から録音が届きました。`,
            icon: 'ic:outline-mic-none'
          })
          break
        }
        default:
          break
      }
    } catch (error) {
      console.warn('Invalid event payload', evt.data, error)
    }
  }
  source.onopen = () => {
    reconnectAttempts.set(doorId, 0)
  }
  source.onerror = (error) => {
    console.error('Door events stream error', doorId, error)
    detachSource(doorId)
    scheduleReconnect(doorId)
  }
  sources.set(doorId, source)
}

const addDoor = async () => {
  console.log("Adding door...");
  if (!isDoorFormValid.value || isSubmitting.value) return;

  const name = door_name.value.trim();

  try {
    isSubmitting.value = true;
    await $fetch('/api/doors', {
      method: "POST",
      body: { name },
    });
    door_name.value = "";
    await refreshDoors();
  } catch (error) {
    console.error("Failed to add door", error);
  } finally {
    isSubmitting.value = false;
  }
};

const deleteDoor = async (id: number) => {
  try {
    await $fetch(`/api/doors/${id}`, { method: "DELETE" });
    await refreshDoors();
  } catch (error) {
    console.error(error);
  }
}

const openDeleteModal = (id: number) => {
  AreYouDelete.value = { id, state: true };
};

onMounted(async () => {
  try {
    await refreshDoors()
  } catch (error) {
    console.error('Failed to load doors', error)
  }

  chime = new Audio('/ring.mp3')
  ring = new Audio('/push.mp3')
  voice = new Audio('/voice.mp3')
  chime.preload = 'auto'
  ring.preload = 'auto'
  voice.preload = 'auto'

  stopDoorsWatch = watch(doorItems, (doors) => {
    const activeIds = new Set<number>([DASHBOARD_DOOR_ID])
    doors.forEach((door) => activeIds.add(door.id))
    activeIds.forEach((id) => attachSource(id))
    for (const id of Array.from(sources.keys())) {
      if (!activeIds.has(id)) detachSource(id)
    }
  }, { immediate: true })
})

watch(receivedRecordingsState, (open) => {
  if (!open) selectedRecordingDoorId.value = null
})

onBeforeUnmount(() => {
  stopDoorsWatch?.()
  detachAllSources()
})

useHead({
  link: [
    { rel: 'manifest', href: '/api/doors/manifest/0' }
  ]
})
</script>

<template>
  <UDashboardGroup>
    <UDashboardPanel>
      <UDashboardNavbar title="ドアホン" icon="ic:outline-door-front">
        <template #right>
          <UButton icon="ic:outline-add" color="neutral" variant="ghost" @click="openAddModal = true" />
          <UColorModeButton />
        </template>
      </UDashboardNavbar>
      <UContainer class="mt-8 mx-auto max-w-[800px]">
        <UPageList v-if="hasDoors">
          <UPageHeader v-for="door in doorItems" :key="door.id" :title="door.name" :description="`ID: ${door.id}`">
            <template #links>
              <UButton label="UIへ移動" target="_blank" variant="outline" icon="ic:outline-open-in-new"
                :to="`/doorphone/${door.id}`" />
              <UButton label="呼ぶ" color="primary" icon="ic:outline-call-made"
                @click="openCallModal = { id: door.id, state: true }" />
              <UButton label="削除" color="error" icon="ic:outline-delete" @click="openDeleteModal(door.id)" />
            </template>
            <template #description>
              <UBadge class="mr-2" color="neutral">ID: {{ door.id }}</UBadge>
              <UBadge v-if="lastTriggers[door.id]" class="mr-2">
                最終呼び出し: {{ lastTriggers[door.id] ?? '--:--:--' }}
              </UBadge>
              <UBadge v-if="recordingLookup[door.id]?.time" variant="outline" color="primary" class="cursor-pointer"
                @click="handleRecordsBadgeClick(door.id)">
                録音受信: {{ recordingLookup[door.id]?.time }}
              </UBadge>
            </template>
          </UPageHeader>
        </UPageList>
        <UPageList v-else>
          <div class="p-4 text-center text-neutral-500">ドアホンが登録されていません。</div>
        </UPageList>
      </UContainer>
    </UDashboardPanel>
  </UDashboardGroup>

  <UModal v-model:open="AreYouDelete.state" title="確認">
    <template #body>
      <p>本当に削除しますか？</p>
    </template>
    <template #footer>
      <UButton color="primary" @click="AreYouDelete.state = false; AreYouDelete.id = 0" icon="ic:outline-clear">キャンセル
      </UButton>
      <UButton color="error" @click="deleteDoor(AreYouDelete.id); AreYouDelete.state = false" icon="ic:outline-check">削除
      </UButton>
    </template>
  </UModal>

  <UModal v-model:open="openCallModal.state" title="呼ぶ">
    <template #body>
      <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="triggerDoor(openCallModal.id); openCallModal.state = false; openCallModal.id = 0">
        <p class="text-center">普通に呼ぶ</p>
      </UButton>
      <USeparator class="my-4" label="or" />
      <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="openRecordModal.state = true; openRecordModal.id = openCallModal.id; openCallModal.state = false; openCallModal.id = 0">
        <p class="text-center">録音を送信</p>
      </UButton>
    </template>
    <template #footer>
      <UButton color="primary" @click="openCallModal.state = false; openCallModal.id = 0" icon="ic:outline-clear">キャンセル
      </UButton>
    </template>
  </UModal>

  <UModal v-model:open="openRecordModal.state" title="録音">
    <template #body>
      <Recorder :from="0" :to="openRecordModal.id" nameFrom="ダッシュボード"
        @sent="openRecordModal.state = false; openRecordModal.id = 0" />
    </template>
    <template #footer>
      <UButton color="error" @click="openRecordModal.state = false; openRecordModal.id = 0" icon="ic:outline-clear">
        キャンセル
      </UButton>
    </template>
  </UModal>

  <UModal v-model:open="openAddModal" title="ドアホンを追加">
    <template #body>
      <UPageList>
        <UInput v-model="door_name" placeholder="ドアホン名" />
      </UPageList>
    </template>

    <template #footer>
      <UButton color="primary" :disabled="!isDoorFormValid" :loading="isSubmitting" icon="ic:outline-check"
        @click="addDoor(); openAddModal = false">追加</UButton>
    </template>
  </UModal>

  <UModal v-model:open="receivedRecordingsState" :title="modalTitle">
    <template #body>
      <div v-if="modalRecordings.length === 0" class="py-4 text-center text-neutral-500">
        録音はありません。
      </div>
      <div v-else class="space-y-4">
        <div v-for="record in modalRecordings" :key="`record-${record.from}-${record.cacheKey}`"
          class="p-4 border border-neutral-200 rounded-lg">
          <Player :from="record.from" :to="record.at" :nameFrom="record.fromName || '不明な送信元'"
            :version="record.cacheKey" />
          <p class="mt-2 text-sm text-neutral-500">受信時間: {{ record.time }}</p>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton color="primary" @click="receivedRecordingsState = false" icon="ic:outline-close">
        閉じる
      </UButton>
    </template>
  </UModal>
</template>
