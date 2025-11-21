<script setup lang="ts">
import { parseDoorEventMessage } from '~/utils/doorEvents';
import { isRecordingRecentlyCreated, upsertReceivedRecording } from '~/utils/recordings';
import { formatDoorEventTime } from '~/utils/time';
import type { Door, DoorActionState, ReceivedRecording } from '~/types/door';
import type { DoorRecordingListItem } from '~~/server/api/doors/[id]/recordings.get';

const toast = useToast();

const door_name = ref<string>('');
const isSubmitting = ref<boolean>(false);

const receivedRecordings = ref<ReceivedRecording[]>([]);
const recordingsLoading = ref(false);
const recordingsError = ref<string | null>(null);
const deletingRecordingFilename = ref<string | null>(null);
const receivedRecordingsState = ref<boolean>(false);
const DASHBOARD_DOOR_ID = 0;
const selectedRecordingDoorId = ref<number | null>(null);

const AreYouDelete = ref<DoorActionState>({ id: 0, state: false });
const openCallModal = ref<DoorActionState>({ id: 0, state: false });
const openRecordModal = ref<DoorActionState>({ id: 0, state: false });
const openAddModal = ref<boolean>(false);
const openWebhookModal = ref<DoorActionState>({ id: 0, state: false });
const webhookUrlInput = ref<string>('');
const isSavingWebhook = ref(false);

const { data: doors, refresh: refreshDoors } = useFetch<Door[]>('/api/doors', {
  server: false,
  lazy: true,
  default: () => []
});

const lastTriggers = reactive<Record<number, string>>({});
const sources = new Map<number, EventSource>();
const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
const reconnectAttempts = new Map<number, number>();

const sseConnected = reactive<Record<number, boolean>>({});
const sseLongDisconnected = reactive<Record<number, boolean>>({});
const pingTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
const PING_TIMEOUT_MS = 45000;
let chime: HTMLAudioElement | null = null;
let ring: HTMLAudioElement | null = null;
let voice: HTMLAudioElement | null = null;
let stopDoorsWatch: (() => void) | null = null;

const triggerDoor = async (doorId: number) => {
  try {
    await $fetch(`/api/doors/${doorId}/press`, {
      method: 'POST',
      body: { source: 'dash', customName: 'ダッシュボード' }
    });
  } catch (error) {
    console.error('Failed to trigger door', error);
  }
};

const isDoorFormValid = computed(() => {
  const name = door_name.value.trim();

  return name.length > 0;
});

const doorItems = computed(() => doors.value ?? []);
const hasDoors = computed(() => doorItems.value.length > 0);

const recordingLookup = computed(() => {
  return receivedRecordings.value.reduce<Record<number, ReceivedRecording>>((acc, record) => {
    acc[record.from] = record;
    return acc;
  }, {});
});

const modalRecordings = computed(() => {
  if (selectedRecordingDoorId.value === null) return [];
  return receivedRecordings.value.filter(record => record.from === selectedRecordingDoorId.value);
});

const selectedDoorName = computed(() => {
  if (selectedRecordingDoorId.value === null) return '';
  return doorItems.value.find(door => door.id === selectedRecordingDoorId.value)?.name ?? `ID ${selectedRecordingDoorId.value}`;
});

const modalTitle = computed(() => {
  if (!selectedDoorName.value) return '受け取った録音';
  return `${selectedDoorName.value}からの録音`;
});

const mapRecordingListItem = (item: DoorRecordingListItem): ReceivedRecording => {
  const updatedAt = item.updatedAt ?? item.createdAt ?? null;
  return {
    from: item.from,
    at: item.to,
    fromName: item.fromName ?? `ID: ${item.from}`,
    time: updatedAt ? formatDoorEventTime(updatedAt) : '--:--:--',
    cacheKey: updatedAt ?? item.filename,
    filename: item.filename,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
};

const loadDashboardRecordings = async () => {
  recordingsLoading.value = true;
  recordingsError.value = null;
  try {
    const response = await $fetch<{ recordings: DoorRecordingListItem[] }>(`/api/doors/${DASHBOARD_DOOR_ID}/recordings`);
    receivedRecordings.value = response.recordings.map(mapRecordingListItem);
  } catch (error) {
    console.error('Failed to load recordings', error);
    recordingsError.value = (error as Error).message ?? '録音の取得に失敗しました。';
  } finally {
    recordingsLoading.value = false;
  }
};

const deleteDashboardRecording = async (record: ReceivedRecording) => {
  if (!record.filename) {
    toast.add({
      title: '録音削除失敗',
      description: '削除対象の録音を特定できませんでした。',
      icon: 'ic:outline-error-outline',
      color: 'error'
    });
    return;
  }
  const encoded = encodeURIComponent(record.filename);
  deletingRecordingFilename.value = record.filename;
  try {
    await $fetch(`/api/doors/${DASHBOARD_DOOR_ID}/recordings/${encoded}`, { method: 'DELETE' });
    receivedRecordings.value = receivedRecordings.value.filter(item => item.filename !== record.filename);
    toast.add({
      title: '録音を削除しました',
      icon: 'ic:outline-check'
    });
  } catch (error) {
    console.error('Failed to delete recording', error);
    toast.add({
      title: '録音削除失敗',
      description: (error as Error).message ?? '録音の削除に失敗しました。',
      icon: 'ic:outline-error-outline',
      color: 'error'
    });
  } finally {
    if (deletingRecordingFilename.value === record.filename) {
      deletingRecordingFilename.value = null;
    }
  }
};

const handleRecordsBadgeClick = (doorId: number) => {
  selectedRecordingDoorId.value = doorId;
  receivedRecordingsState.value = true;
};

const isAnySseConnected = computed(() => Object.values(sseConnected).some(Boolean));
const hasLongDisconnected = computed(() => Object.values(sseLongDisconnected).some(Boolean));

const clearDoorPingTimeout = (doorId: number) => {
  const timeout = pingTimeouts.get(doorId);
  if (timeout) {
    clearTimeout(timeout);
    pingTimeouts.delete(doorId);
  }
};

const detachSource = (doorId: number, options?: { preserveState?: boolean }) => {
  sources.get(doorId)?.close();
  sources.delete(doorId);
  if (!options?.preserveState) {
    Reflect.deleteProperty(lastTriggers, doorId);
  }
  reconnectAttempts.delete(doorId);
  const timer = reconnectTimers.get(doorId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(doorId);
  }

  clearDoorPingTimeout(doorId);
  if (!options?.preserveState) {
    sseConnected[doorId] = false;
    sseLongDisconnected[doorId] = false;
  }
};

const detachAllSources = () => {
  for (const id of Array.from(sources.keys())) detachSource(id);
};

const scheduleReconnect = (doorId: number) => {
  const nextAttempt = (reconnectAttempts.get(doorId) ?? 0) + 1;
  reconnectAttempts.set(doorId, nextAttempt);
  const delay = Math.min(30000, 1000 * 2 ** (nextAttempt - 1));
  const timer = setTimeout(() => {
    reconnectTimers.delete(doorId);
    attachSource(doorId);
  }, delay);
  reconnectTimers.set(doorId, timer);
};

const markDoorConnected = (doorId: number) => {
  sseConnected[doorId] = true;
  sseLongDisconnected[doorId] = false;
  clearDoorPingTimeout(doorId);
  const timeout = setTimeout(() => {
    sseConnected[doorId] = false;
    sseLongDisconnected[doorId] = true;
    pingTimeouts.delete(doorId);
  }, PING_TIMEOUT_MS);
  pingTimeouts.set(doorId, timeout);
};

const attachSource = (doorId: number) => {
  if (sources.has(doorId)) return;
  const source = new EventSource(`/api/doors/${doorId}/events`);
  reconnectAttempts.set(doorId, 0);

  sseConnected[doorId] = false;
  source.onmessage = (evt) => {
    const parsed = parseDoorEventMessage(evt.data);
    if (parsed.kind === 'ping') {
      markDoorConnected(doorId);
      return;
    }
    if (parsed.kind === 'invalid') {
      console.warn('Invalid event payload', evt.data, parsed.error);
      return;
    }
    const payload = parsed.payload;
    const timeLabel = formatDoorEventTime(payload.triggeredAt);
    markDoorConnected(doorId);
    switch (payload.type) {
      case 'door': {
        lastTriggers[doorId] = timeLabel;
        const doorName = payload.name ?? doorItems.value.find(door => door.id === doorId)?.name ?? `ID ${doorId}`;
        toast.add({
          title: '呼び出し',
          description: `${doorName}が${timeLabel}に押されました。`,
          icon: 'ic:outline-call-received'
        });
        if (chime) {
          try {
            const chimeInstance = chime.cloneNode(true) as HTMLAudioElement;
            void chimeInstance.play();
          } catch (playError) {
            console.warn('Audio playback blocked', playError);
          }
        }
        break;
      }
      case 'dash': {
        toast.add({
          title: '呼び出し完了!',
          description: `${payload.name}を呼び出しました。`,
          icon: 'ic:outline-check'
        });
        if (ring) {
          try {
            const ringInstance = ring.cloneNode(true) as HTMLAudioElement;
            void ringInstance.play();
          } catch (playError) {
            console.warn('Audio playback blocked', playError);
          }
        }
        break;
      }
      case 'record': {
        if (doorId !== DASHBOARD_DOOR_ID) break;
        upsertReceivedRecording({
          records: receivedRecordings,
          payload,
          targetDoorId: doorId,
          timeLabel
        });

        if (voice) {
          try {
            const voiceInstance = voice.cloneNode(true) as HTMLAudioElement;
            void voiceInstance.play();
          } catch (playError) {
            console.warn('Audio playback blocked', playError);
          }
        }

        toast.add({
          title: '録音呼び出し',
          description: `${payload.nameFrom ?? '不明'}から録音が届きました。`,
          icon: 'ic:outline-mic-none'
        });
        break;
      }
      default:
        break;
    }
  };
  source.onopen = () => {
    reconnectAttempts.set(doorId, 0);

    markDoorConnected(doorId);
  };
  source.onerror = (error) => {
    console.error('Door events stream error', doorId, error);

    sseConnected[doorId] = false;
    sseLongDisconnected[doorId] = true;
    clearDoorPingTimeout(doorId);
    detachSource(doorId, { preserveState: true });
    scheduleReconnect(doorId);
  };
  sources.set(doorId, source);
};

const addDoor = async () => {
  console.log('Adding door...');
  if (!isDoorFormValid.value || isSubmitting.value) return;

  const name = door_name.value.trim();

  try {
    isSubmitting.value = true;
    await $fetch('/api/doors', {
      method: 'POST',
      body: { name }
    });
    door_name.value = '';
    await refreshDoors();
  } catch (error) {
    console.error('Failed to add door', error);
  } finally {
    isSubmitting.value = false;
  }
};

const deleteDoor = async (id: number) => {
  try {
    await $fetch(`/api/doors/${id}`, { method: 'DELETE' });
    await refreshDoors();
  } catch (error) {
    console.error(error);
  }
};

const openDeleteModal = (id: number) => {
  AreYouDelete.value = { id, state: true };
};

const openWebhookEditor = (door: Door) => {
  openWebhookModal.value = { id: door.id, state: true, name: door.name };
  webhookUrlInput.value = door.webhookUrl ?? '';
};

const closeWebhookEditor = () => {
  openWebhookModal.value = { id: 0, state: false, name: undefined };
  webhookUrlInput.value = '';
};

const saveWebhookUrl = async () => {
  if (!openWebhookModal.value.state) return;
  try {
    isSavingWebhook.value = true;
    const trimmedValue = webhookUrlInput.value.trim();
    await $fetch(`/api/doors/${openWebhookModal.value.id}`, {
      method: 'PATCH',
      body: { webhookUrl: trimmedValue || null }
    });
    toast.add({
      title: 'Webhookを更新しました',
      icon: 'ic:outline-check'
    });
    closeWebhookEditor();
    await refreshDoors();
  } catch (error) {
    console.error('Failed to update webhook URL', error);
    toast.add({
      title: 'Webhook更新失敗',
      description: 'URLを確認してもう一度お試しください。',
      icon: 'ic:outline-error-outline',
      color: 'error'
    });
  } finally {
    isSavingWebhook.value = false;
  }
};

onMounted(async () => {
  try {
    await refreshDoors();
  } catch (error) {
    console.error('Failed to load doors', error);
  }

  chime = new Audio('/ring.mp3');
  ring = new Audio('/push.mp3');
  voice = new Audio('/voice.mp3');
  chime.preload = 'auto';
  ring.preload = 'auto';
  voice.preload = 'auto';

  stopDoorsWatch = watch(doorItems, (doors) => {
    const activeIds = new Set<number>([DASHBOARD_DOOR_ID]);
    doors.forEach(door => activeIds.add(door.id));
    activeIds.forEach(id => attachSource(id));
    for (const id of Array.from(sources.keys())) {
      if (!activeIds.has(id)) detachSource(id);
    }
  }, { immediate: true });

  void loadDashboardRecordings();
});

watch(receivedRecordingsState, (open) => {
  if (open) {
    void loadDashboardRecordings();
  } else {
    selectedRecordingDoorId.value = null;
  }
});

onBeforeUnmount(() => {
  stopDoorsWatch?.();
  detachAllSources();
});

useHead({
  link: [
    { rel: 'manifest', href: '/api/doors/manifest/0' }
  ]
});
</script>

<template>
  <div class="space-y-8">
    <UDashboardGroup>
      <UDashboardPanel>
        <UDashboardNavbar title="ドアホン" icon="ic:outline-door-front">
          <template #right>
            <UButton icon="ic:outline-add" color="neutral" variant="ghost" @click="openAddModal = true" />
            <div v-if="isAnySseConnected">
              <UButton icon="ic:outline-wifi-tethering" color="success" variant="ghost" />
            </div>
            <div v-else-if="hasLongDisconnected">
              <UButton icon="ic:outline-wifi-tethering-error" color="error" variant="ghost" />
            </div>
            <div v-else>
              <UButton icon="ic:outline-wifi-tethering" color="neutral" variant="ghost" :loading="true" />
            </div>
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
                <UButton label="Webhook" color="neutral" icon="ic:outline-webhook" @click="openWebhookEditor(door)" />
                <UButton label="削除" color="error" icon="ic:outline-delete" @click="openDeleteModal(door.id)" />
              </template>
              <template #description>
                <UBadge class="mr-2" color="neutral">
                  ID: {{ door.id }}
                </UBadge>
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
            <div class="p-4 text-center text-neutral-500">
              ドアホンが登録されていません。
            </div>
          </UPageList>
        </UContainer>
      </UDashboardPanel>
    </UDashboardGroup>

    <UModal v-model:open="AreYouDelete.state" title="確認">
      <template #body>
        <p>本当に削除しますか？</p>
      </template>
      <template #footer>
        <UButton color="primary" icon="ic:outline-clear" @click="AreYouDelete.state = false; AreYouDelete.id = 0">
          キャンセル
        </UButton>
        <UButton color="error" icon="ic:outline-check" @click="deleteDoor(AreYouDelete.id); AreYouDelete.state = false">
          削除
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="openCallModal.state" title="呼ぶ">
      <template #body>
        <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
          size="xl" @click="triggerDoor(openCallModal.id); openCallModal.state = false; openCallModal.id = 0">
          <p class="text-center">
            普通に呼ぶ
          </p>
        </UButton>
        <USeparator class="my-4" label="or" />
        <UButton class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
          size="xl"
          @click="openRecordModal.state = true; openRecordModal.id = openCallModal.id; openCallModal.state = false; openCallModal.id = 0">
          <p class="text-center">
            録音を送信
          </p>
        </UButton>
      </template>
      <template #footer>
        <UButton color="primary" icon="ic:outline-clear" @click="openCallModal.state = false; openCallModal.id = 0">
          閉じる
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="openRecordModal.state" title="録音">
      <template #body>
        <Recorder :from="0" :to="openRecordModal.id" name-from="ダッシュボード"
          @sent="openRecordModal.state = false; openRecordModal.id = 0" />
      </template>
      <template #footer>
        <UButton color="error" icon="ic:outline-clear" @click="openRecordModal.state = false; openRecordModal.id = 0">
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
        <UButton color="error" icon="ic:outline-close" @click="openAddModal = false">
          キャンセル
        </UButton>
        <UButton color="primary" :disabled="!isDoorFormValid" :loading="isSubmitting" icon="ic:outline-check"
          @click="addDoor(); openAddModal = false">
          追加
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="openWebhookModal.state" :title="`${openWebhookModal.name ?? 'ドア'}のWebhook設定`">
      <template #body>
        <UPageList>
          <UInput v-model="webhookUrlInput" placeholder="https://discord.com/api/webhooks/..." />
        </UPageList>
      </template>
      <template #footer>
        <UButton color="error" icon="ic:outline-close" @click="closeWebhookEditor()">
          キャンセル
        </UButton>
        <UButton color="primary" icon="ic:outline-check" :loading="isSavingWebhook" @click="saveWebhookUrl()">
          保存
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="receivedRecordingsState" :title="modalTitle">
      <template #body>
        <UPageList>
          <div v-if="recordingsLoading" class="text-center">
            <UProgress color="neutral" animation="swing" />
          </div>
          <div v-else-if="recordingsError" class="text-center text-error-600">
            {{ recordingsError }}
          </div>
          <div v-else-if="modalRecordings.length === 0" class="text-center text-neutral-500">
            録音はありません。
          </div>
          <div v-else class="space-y-4">
            <div v-for="record in modalRecordings" :key="`record-${record.from}-${record.cacheKey}`"
              class="p-4 border border-neutral-200 rounded-lg space-y-2">
              <UBadge v-if="isRecordingRecentlyCreated(record)" color="primary" variant="solid" size="xs">
                NEW
              </UBadge>
              <Player :from="record.from" :to="record.at" :name-from="record.fromName || '不明な送信元'"
                :version="record.cacheKey" :src="record.url" />
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-500">
                <span>
                  受信時間: {{ record.time }}
                </span>
                <UButton icon="ic:outline-delete" color="error" variant="soft" size="sm"
                  :disabled="!record.filename || deletingRecordingFilename === record.filename"
                  :loading="deletingRecordingFilename === record.filename" @click="deleteDashboardRecording(record)">
                  削除
                </UButton>
              </div>
            </div>
          </div>
        </UPageList>
      </template>

      <template #footer>
        <UButton color="neutral" icon="ic:outline-close" @click="receivedRecordingsState = false">
          閉じる
        </UButton>
        <UButton color="primary" icon="ic:outline-refresh" :loading="recordingsLoading"
          @click="loadDashboardRecordings">
          更新
        </UButton>
      </template>
    </UModal>
  </div>
</template>
