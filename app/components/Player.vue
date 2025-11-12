<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DoorEventPayload } from '~~/server/api/doors/[id]/events'

const props = defineProps<{
    from: DoorEventPayload['id']
    to: DoorEventPayload['id']
    nameFrom: string
    version?: string
}>()

const audioElement = ref<HTMLAudioElement | null>(null)
const loadFailed = ref(false)

const audioSrc = computed(() => {
    const base = `/temp/door-${props.from}-to-${props.to}.webm`
    if (!props.version) return base
    return `${base}?v=${encodeURIComponent(props.version)}`
})

const reloadAudio = async () => {
    if (!audioElement.value) return
    audioElement.value.pause()
    audioElement.value.currentTime = 0
    await nextTick()
    audioElement.value.load()
}

watch(audioSrc, (next, prev) => {
    if (next === prev) return
    loadFailed.value = false
    void reloadAudio()
})

const handleAudioError = () => {
    loadFailed.value = true
}

const handleLoadedData = () => {
    loadFailed.value = false
}

onBeforeUnmount(() => {
    if (!audioElement.value) return
    audioElement.value.pause()
    audioElement.value.removeAttribute('src')
    audioElement.value.load()
})
</script>

<template>
    <div class="space-y-2">
        <p class="font-medium">
            {{ props.nameFrom }}からの録音
        </p>
        <audio
            ref="audioElement"
            :src="audioSrc"
            controls
            class="w-full"
            preload="auto"
            @error="handleAudioError"
            @loadeddata="handleLoadedData"
        />
        <p v-if="loadFailed" class="text-sm text-error-600">音声を読み込めませんでした。</p>
    </div>
</template>
