<script setup lang="ts">
import { createError } from '#app';
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { parseDoorEventMessage } from '~/utils/doorEvents';
import { isRecordingRecentlyCreated, upsertReceivedRecording } from '~/utils/recordings';
import { formatDoorEventTime } from '~/utils/time';
import type { Door, DoorActionState, ReceivedRecording } from '~/types/door';
import type { DoorRecordingListItem } from '~~/server/api/doors/[id]/recordings.get';

const toast = useToast();
const route = useRoute();

const triggerModalState = ref<boolean>(false);
const triggeringDoorId = ref<number | null>(null);

const lastnameFrom = ref<[string, string] | null>(null);

const openCallModal = ref<DoorActionState>({ id: 0, state: false });
const openRecordModal = ref<DoorActionState>({ id: 0, state: false });

const receivedRecordings = ref<ReceivedRecording[]>([]);
const receivedRecordingsTemp = ref<ReceivedRecording[]>([]);
const recordingsLoading = ref(false);
const recordingsError = ref<string | null>(null);
const deletingRecordingFilename = ref<string | null>(null);
const receivedRecordingsState = ref<boolean>(false);

const rawId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;
const sanitizedId = rawId?.toString().trim() ?? '';

if (!/^\d+$/.test(sanitizedId)) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid door id'
  });
}

const { data: device, error } = await useFetch<Door>(`/api/doors/${sanitizedId}`, {
  key: `door-${sanitizedId}`
});

const {
  data: doors,
  pending: doorsPending,
  refresh: refreshDoors
} = useFetch<Door[]>(`/api/doors`, {
  server: false,
  lazy: true,
  default: () => []
});

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 500,
    statusMessage: error.value.statusMessage ?? 'Failed to load door data'
  });
}

const currentDoorId = Number.parseInt(sanitizedId, 10);

const deviceName = computed(() => device.value?.name ?? 'ドアホン');
const otherDoors = computed(() => (doors.value ?? []).filter(door => door.id !== currentDoorId));

const currentTime = ref<string>('--:--:--');
const lastRingAt = ref<string | null>(null);

const formatRecordingListItem = (item: DoorRecordingListItem): ReceivedRecording => {
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

const loadReceivedRecordings = async () => {
  recordingsLoading.value = true;
  recordingsError.value = null;
  try {
    const response = await $fetch<{ recordings: DoorRecordingListItem[] }>(`/api/doors/${sanitizedId}/recordings`);
    receivedRecordings.value = response.recordings.map(formatRecordingListItem);
  } catch (error) {
    console.error('Failed to load recordings', error);
    recordingsError.value = (error as Error).message ?? '録音の取得に失敗しました。';
  } finally {
    recordingsLoading.value = false;
  }
};

const deleteRecording = async (record: ReceivedRecording) => {
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
    await $fetch(`/api/doors/${sanitizedId}/recordings/${encoded}`, { method: 'DELETE' });
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

const triggerDoor = async () => {
  try {
    await $fetch(`/api/doors/${sanitizedId}/press`, {
      method: 'POST',
      body: { source: 'door' }
    });
  } catch (error) {
    console.error('Failed to trigger door', error);
  }
};

const triggerOtherDoor = async (doorId: number, doorName: string) => {
  if (triggeringDoorId.value) return;
  try {
    triggeringDoorId.value = doorId;
    await $fetch(`/api/doors/${doorId}/press`, {
      method: 'POST',
      body: { source: 'dash', customName: deviceName.value }
    });
    toast.add({
      title: '呼び出し完了!',
      description: `${doorName}を呼び出しました。`,
      icon: 'ic:outline-check'
    });
    if (chime) {
      try {
        const chimeInstance = chime.cloneNode(true) as HTMLAudioElement;
        void chimeInstance.play();
      } catch (playError) {
        console.warn('Audio playback blocked', playError);
      }
    }
    triggerModalState.value = false;
  } catch (error) {
    console.error('Failed to trigger door', error);
    toast.add({
      title: '呼び出し失敗',
      icon: 'ic:outline-error-outline',
      color: 'error'
    });
  } finally {
    triggeringDoorId.value = null;
  }
};

const openTriggerModal = async () => {
  try {
    await refreshDoors();
  } catch (error) {
    console.error('Failed to load doors', error);
  }
  triggerModalState.value = true;
};

let intervalId: ReturnType<typeof setInterval> | null = null;
let chime: HTMLAudioElement | null = null;
let ring: HTMLAudioElement | null = null;
let voice: HTMLAudioElement | null = null;
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

const sseConnected = ref(false);
const sseLongDisconnected = ref(false);
const PING_TIMEOUT_MS = 45000;
let pingTimeout: ReturnType<typeof setTimeout> | null = null;

const updateTime = () => {
  currentTime.value = formatDoorEventTime(new Date().toISOString());
};

const clearPingTimeout = () => {
  if (pingTimeout) {
    clearTimeout(pingTimeout);
    pingTimeout = null;
  }
};

const markSseConnected = () => {
  sseConnected.value = true;
  sseLongDisconnected.value = false;
  clearPingTimeout();
  pingTimeout = setTimeout(() => {
    sseConnected.value = false;
    sseLongDisconnected.value = true;
  }, PING_TIMEOUT_MS);
};

const detachSource = (resetState = true) => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearPingTimeout();
  if (resetState) {
    sseConnected.value = false;
    sseLongDisconnected.value = false;
  }
};

const scheduleReconnect = () => {
  if (reconnectTimer) return;
  reconnectAttempt += 1;
  const delay = Math.min(30000, 1000 * 2 ** (reconnectAttempt - 1));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    attachSource();
  }, delay);
};

const attachSource = () => {
  if (eventSource) return;
  const source = new EventSource(`/api/doors/${sanitizedId}/events`);
  reconnectAttempt = 0;
  sseConnected.value = false;
  source.onmessage = (evt) => {
    const parsed = parseDoorEventMessage(evt.data);
    if (parsed.kind === 'ping') {
      markSseConnected();
      return;
    }
    if (parsed.kind === 'invalid') {
      console.warn('Received invalid event payload', evt.data, parsed.error);
      toast.add({
        title: '呼び出し失敗',
        icon: 'ic:outline-error-outline',
        color: 'error'
      });
      return;
    }
    const payload = parsed.payload;
    const timeLabel = formatDoorEventTime(payload.triggeredAt);
    lastRingAt.value = timeLabel;
    console.log('Received door event', payload);
    markSseConnected();
    switch (payload.type) {
      case 'door':
        toast.add({
          title: '呼び出し完了!',
          icon: 'ic:outline-check'
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
      case 'dash':
        toast.add({
          title: `${payload.nameFrom}から呼び出し`,
          description: `${payload.name}が${timeLabel}に押されました。`,
          icon: 'ic:outline-call-received'
        });
        lastnameFrom.value = [payload.nameFrom ?? '', timeLabel];
        if (ring) {
          try {
            const ringInstance = ring.cloneNode(true) as HTMLAudioElement;
            void ringInstance.play();
          } catch (playError) {
            console.warn('Audio playback blocked', playError);
          }
        }
        break;
      case 'record': {
        upsertReceivedRecording({
          records: receivedRecordings,
          payload,
          targetDoorId: currentDoorId,
          timeLabel
        });
        upsertReceivedRecording({
          records: receivedRecordingsTemp,
          payload,
          targetDoorId: currentDoorId,
          timeLabel
        });
        toast.add({
          title: '録音呼び出し',
          description: `${payload.nameFrom}から録音が届きました。`,
          icon: 'ic:outline-mic-none'
        });
        if (voice) {
          try {
            const voiceInstance = voice.cloneNode(true) as HTMLAudioElement;
            void voiceInstance.play();
          } catch (playError) {
            console.warn('Audio playback blocked', playError);
          }
        }
        break;
      }
      default:
        break;
    }
  };
  source.onopen = () => {
    reconnectAttempt = 0;
    markSseConnected();
  };
  source.onerror = (error) => {
    console.error('Door events stream error', sanitizedId, error);
    sseConnected.value = false;
    sseLongDisconnected.value = true;
    clearPingTimeout();
    detachSource(false);
    scheduleReconnect();
  };
  eventSource = source;
};

onMounted(() => {
  updateTime();
  intervalId = setInterval(() => {
    updateTime();
  }, 1000);
  chime = new Audio('/push.mp3');
  ring = new Audio('/ring.mp3');
  voice = new Audio('/voice.mp3');
  chime.preload = 'auto';
  ring.preload = 'auto';
  voice.preload = 'auto';
  attachSource();
  void loadReceivedRecordings();
});

onBeforeUnmount(() => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  detachSource();
});

watch(receivedRecordingsState, (open) => {
  if (open) {
    void loadReceivedRecordings();
  }
});

useHead(() => ({
  link: [
    { rel: 'manifest', href: `/api/doors/manifest/${sanitizedId}` }
  ]
}));
</script>

<template>
  <div class="space-y-8">
    <UHeader>
      <template #left>
        <h1 class="font-bold">
          {{ deviceName }}
        </h1>
        <UBadge color="neutral" variant="outline">
          {{ currentTime }}
        </UBadge>
      </template>
      <template #right>
        <UBadge color="neutral">
          ID: {{ rawId }}
        </UBadge>
        <UBadge v-if="lastRingAt" color="primary">
          最終呼び出し: {{ lastRingAt }}
        </UBadge>
        <div v-if="sseConnected">
          <UButton icon="ic:outline-wifi-tethering" color="success" variant="ghost" />
        </div>
        <div v-else-if="sseLongDisconnected">
          <UButton icon="ic:outline-wifi-tethering-error" color="error" variant="ghost" />
        </div>
        <div v-else>
          <UButton icon="ic:outline-wifi-tethering" color="neutral" variant="ghost" :loading="true" />
        </div>
        <UChip :show="receivedRecordingsTemp.length > 0" inset>
          <UButton icon="ic:outline-inbox" color="neutral" variant="ghost" @click="receivedRecordingsState = true;" />
        </UChip>
        <UColorModeButton />
      </template>
    </UHeader>
    <UContainer class="mt-8 mx-auto max-w-[800px]">
      <div class="flex gap-4">
        <UAlert v-if="lastnameFrom" title="呼び出しがありました。"
          :description="lastnameFrom ? `${lastnameFrom[0]}から${lastnameFrom[1]}に呼び出されました。` : ''" close
          close-icon="ic:outline-close" icon="ic:outline-call-missed" variant="outline" color="neutral"
          class="cursor-pointer" @click="lastnameFrom = null" />
        <UAlert v-if="receivedRecordingsTemp.length > 0" title="録音が届いています。"
          :description="`受け取った録音が${receivedRecordingsTemp.length}件あります。`" icon="ic:outline-mic-none" variant="outline" close close-icon="ic:outline-close"
          class="cursor-pointer" color="neutral" @click="receivedRecordingsState = true; receivedRecordingsTemp = []" />
      </div>

      <UButton v-if="rawId != '0'" color="primary"
        class="my-4 w-full h-[50vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="triggerDoor()">
        <p class="text-center">
          呼ぶ
        </p>
      </UButton>
      <UButton color="neutral"
        class="my-4 w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4" size="xl"
        @click="openTriggerModal()">
        <p class="text-center">
          他の部屋を呼ぶ
        </p>
      </UButton>
    </UContainer>

    <UModal v-model:open="triggerModalState" title="どの部屋を呼びますか?">
      <template #body>
        <div v-if="doorsPending" class="text-center">
          <UProgress color="neutral" animation="swing" />
        </div>
        <div v-else-if="otherDoors.length === 0" class="text-center text-neutral-500">
          <UButton v-if="rawId != '0'" color="primary" variant="solid" icon="ic:outline-call-made" block
            @click="triggerModalState = false; openRecordModal.state = true; openRecordModal.id = 0">
            ダッシュボード
          </UButton>
        </div>
        <div v-else class="space-y-3">
          <UButton v-for="door in otherDoors" :key="door.id" color="neutral" variant="solid" block
            :loading="triggeringDoorId === door.id" icon="ic:outline-call-made"
            @click="openCallModal.id = door.id; openCallModal.name = door.name; openCallModal.state = true; triggerModalState = false">
            {{ door.name }}
          </UButton>
          <UButton v-if="rawId != '0'" color="primary" variant="solid" icon="ic:outline-call-made" block
            @click="triggerModalState = false; openRecordModal.state = true; openRecordModal.id = 0">
            ダッシュボード
          </UButton>
        </div>
      </template>
      <template #footer>
        <UButton color="primary" icon="ic:outline-clear" @click="triggerModalState = false;">
          閉じる
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="receivedRecordingsState" title="受け取った録音">
      <template #body>
        <UPageList>
          <div v-if="recordingsLoading" class="text-center">
            <UProgress color="neutral" animation="swing" />
          </div>
          <div v-else-if="recordingsError" class="text-center text-error-600">
            {{ recordingsError }}
          </div>
          <div v-else-if="receivedRecordings.length === 0" class="text-center text-neutral-500">
            受け取った録音はありません。
          </div>
          <div v-else class="space-y-4">
            <div v-for="record in receivedRecordings" :key="`${record.from}-${record.at}-${record.cacheKey}`"
              class="p-4 border border-neutral-200 rounded-lg space-y-2">
              <UBadge v-if="isRecordingRecentlyCreated(record)" color="primary" variant="solid" size="xs">
                NEW
              </UBadge>
              <Player :from="record.from" :to="record.at" :name-from="record.fromName" :version="record.cacheKey"
                :src="record.url" />
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-500">
                <span>
                  受信時間: {{ record.time }}
                </span>
                <UButton icon="ic:outline-delete" color="error" variant="soft" size="sm"
                  :disabled="!record.filename || deletingRecordingFilename === record.filename"
                  :loading="deletingRecordingFilename === record.filename" @click="deleteRecording(record)">
                  削除
                </UButton>
              </div>
            </div>
          </div>
        </UPageList>
      </template>

      <template #footer>
        <UButton color="neutral" icon="ic:outline-clear" @click="receivedRecordingsState = false;">
          閉じる
        </UButton>
        <UButton color="primary" icon="ic:outline-refresh" :loading="recordingsLoading" @click="loadReceivedRecordings">
          更新
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="openCallModal.state" title="呼ぶ">
      <template #body>
        <UButton class="w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
          size="xl"
          @click="triggerOtherDoor(openCallModal.id, openCallModal.name || 'Unknown'); openCallModal.state = false; openCallModal.id = 0">
          <p class="text-center">
            普通に呼ぶ
          </p>
        </UButton>
        <USeparator class="my-4" label="or" />
        <UButton class="w-full h-[20vh] py-8 text-4xl font-semibold flex items-center justify-center gap-4"
          size="xl"
          @click="openRecordModal.state = true; openRecordModal.id = openCallModal.id; openCallModal.state = false; openCallModal.id = 0">
          <p class="text-center">
            録音を送信
          </p>
        </UButton>
      </template>
      <template #footer>
        <UButton color="primary" icon="ic:outline-clear"
          @click="openCallModal.state = false; openCallModal.id = 0; openCallModal.name = undefined">
          閉じる
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="openRecordModal.state" title="録音">
      <template #body>
        <Recorder :from="currentDoorId" :to="openRecordModal.id" :name-from="deviceName"
          @sent="openRecordModal.state = false; openRecordModal.id = 0" />
      </template>
      <template #footer>
        <UButton color="error" icon="ic:outline-clear" @click="openRecordModal.state = false; openRecordModal.id = 0">
          キャンセル
        </UButton>
      </template>
    </UModal>
  </div>
</template>
