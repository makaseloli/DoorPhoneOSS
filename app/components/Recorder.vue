<script setup lang="ts">
import type { DoorEventPayload } from '~~/server/api/doors/[id]/events'

defineOptions({
  name: 'DoorAudioRecorder'
})

const props = defineProps<{
  from: DoorEventPayload['id']
  to: DoorEventPayload['id']
  nameFrom: string
}>()

const emit = defineEmits<{
  (event: 'start' | 'stop' | 'sent'): void
  (event: 'error', error: unknown): void
}>()

const toast = useToast()

const isRecording = ref(false)
const isSending = ref(false)
const recordedBlob = ref<Blob | null>(null)
const recorder = ref<MediaRecorder | null>(null)
const chunks: BlobPart[] = []
let chime: HTMLAudioElement | null = null

const audioUrl = computed(() => {
  if (!recordedBlob.value) return null
  return URL.createObjectURL(recordedBlob.value)
});

const resetRecording = () => {
  if (isRecording.value) recorder.value?.stop()
  recorder.value = null
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  recordedBlob.value = null
  isRecording.value = false
};

const startRecording = async () => {
  if (isRecording.value || typeof window === 'undefined') return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder.value = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    chunks.length = 0

    recorder.value.ondataavailable = (evt) => {
      if (evt.data.size > 0) chunks.push(evt.data)
    };
    recorder.value.onstop = () => {
      recordedBlob.value = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
      stream.getTracks().forEach(track => track.stop())
      emit('stop')
    };

    recorder.value.start()
    isRecording.value = true
    recordedBlob.value = null
    emit('start')
  } catch (error) {
    toast.add({
      title: '録音失敗',
      description: 'マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。',
      icon: 'ic:outline-error-outline',
      color: 'error'
    })
    emit('error', error)
  }
}

const stopRecording = () => {
  if (!recorder.value || recorder.value.state !== 'recording') return
  recorder.value.stop()
  isRecording.value = false
};

const sendRecording = async () => {
  if (!recordedBlob.value || isSending.value) return
  isSending.value = true
  try {
    const formData = new FormData()
    formData.append('audio', recordedBlob.value, `door-${props.from}-to-${props.to}.webm`)
    await $fetch(`/api/doors/audio`, {
      method: 'POST',
      body: formData
    })
    await $fetch(`/api/doors/${props.to}/press`, {
      method: 'POST',
      body: { source: 'record', idFrom: props.from, customName: props.nameFrom }
    })
    if (chime) {
      try {
        const chimeInstance = chime.cloneNode(true) as HTMLAudioElement
        void chimeInstance.play()
      } catch (playError) {
        console.warn('Audio playback blocked', playError)
      }
    }
    emit('sent')
    toast.add({
      title: '音声送信完了!',
      description: '録音した音声を送信しました。',
      icon: 'ic:outline-check'
    })
    resetRecording()
  } catch (error) {
    emit('error', error)
    toast.add({
      title: '音声送信失敗',
      description: `録音した音声の送信に失敗しました。${(error as Error).message}`,
      icon: 'ic:outline-error-outline',
      color: 'error'
    })
  } finally {
    isSending.value = false
  }
}

onBeforeUnmount(() => {
  resetRecording()
});

onMounted(() => {
  chime = new Audio('/push.mp3')
  chime.preload = 'auto'
});
</script>

<template>
  <div class="space-y-4">
    <UAlert
      description="古い録音は削除されます。"
      variant="outline"
      color="warning"
      icon="ic:outline-warning-amber"
    />
    <UAlert
      description="仕組み上必ずしも録音が届くとは限りません。重要なメッセージは別の方法で伝えてください。"
      variant="outline"
      color="error"
      icon="ic:outline-error-outline"
    />
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        v-if="!isRecording"
        icon="ic:outline-mic-none"
        color="primary"
        :disabled="isRecording"
        @click="startRecording"
      >
        録音開始
      </UButton>
      <UButton
        v-if="isRecording"
        icon="ic:outline-stop-circle"
        color="error"
        :disabled="!isRecording"
        @click="stopRecording"
      >
        録音停止
      </UButton>
      <UButton
        v-if="isRecording"
        icon="ic:outline-refresh"
        variant="outline"
        :disabled="!recordedBlob && !isRecording"
        @click="resetRecording"
      >
        やり直す
      </UButton>
    </div>

    <div
      v-if="audioUrl"
      class="space-y-3"
    >
      <audio
        :src="audioUrl"
        controls
        class="w-full"
      />
      <div class="flex flex-wrap gap-3">
        <UButton
          icon="ic:outline-send"
          color="success"
          :loading="isSending"
          @click="sendRecording"
        >
          音声を送信
        </UButton>
        <UButton
          icon="ic:outline-close"
          color="error"
          :disabled="isSending"
          @click="resetRecording"
        >
          破棄する
        </UButton>
      </div>
    </div>
  </div>
</template>
