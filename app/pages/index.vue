<script setup lang="ts">
interface Door {
  id: number
  name: string
}
interface DeleteForm {
  id: number
  state: boolean
}

const toast = useToast()

const door_name = ref<string>("");
const isSubmitting = ref<boolean>(false);

const AreYouDelete = ref<DeleteForm>({ id: 0, state: false });
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
      const payload = JSON.parse(evt.data) as { triggeredAt: string; triggeredFrom?: string; name?: string, type: 'door' | 'dash' }
      const timeLabel = formatTime(payload.triggeredAt)

      switch (payload.type) {
        case 'door':
          lastTriggers[doorId] = timeLabel
          const doorName = payload.name ?? doorItems.value.find((door) => door.id === doorId)?.name ?? `ID ${doorId}`
          toast.add({
            title: '呼び出し',
            description: `${doorName}が${timeLabel}に押されました。`,
            icon: 'ic:outline-call-received',
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
            title: `呼び出し完了!`,
            description: `${payload.name}を呼び出しました。`,
            icon: 'ic:outline-check'
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
  chime.preload = 'auto'
  ring.preload = 'auto'

  stopDoorsWatch = watch(doorItems, (doors) => {
    const activeIds = doors.map((door) => door.id)
    activeIds.forEach(attachSource)
    for (const id of Array.from(sources.keys())) {
      if (!activeIds.includes(id)) detachSource(id)
    }
  }, { immediate: true })
})

onBeforeUnmount(() => {
  stopDoorsWatch?.()
  detachAllSources()
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
              <UButton label="呼ぶ" color="primary" icon="ic:outline-call-made" @click="triggerDoor(door.id)" />
              <UButton label="削除" color="error" icon="ic:outline-delete" @click="openDeleteModal(door.id)" />
            </template>
            <template #description>
              <UBadge class="mr-2" color="neutral">ID: {{ door.id }}</UBadge>
              <UBadge v-if="lastTriggers[door.id]">
                最終呼び出し: {{ lastTriggers[door.id] ?? '--:--:--' }}
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
</template>
