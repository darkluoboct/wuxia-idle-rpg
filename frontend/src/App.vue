<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import OnlineEntry from '@/components/OnlineEntry.vue'
import { IS_GUEST_ENTRY, IS_MOCK_MODE } from '@/network/apiClient'
import { useOnlineStore } from '@/stores/onlineStore'

const GameShell = defineAsyncComponent(() => import('./GameShell.vue'))
const session = useOnlineStore()
const mode = new URLSearchParams(window.location.search).get('mode')
const showingLocalEntry = ref(IS_MOCK_MODE && !IS_GUEST_ENTRY && mode !== 'new' && mode !== 'demo')
const gameVisible = computed(
  () => !showingLocalEntry.value && (session.phase === 'ready' || session.phase === 'create'),
)
const gameOpened = ref(gameVisible.value)

watch(gameVisible, (visible) => {
  if (visible) gameOpened.value = true
})
onMounted(() => void session.resume())
</script>

<template>
  <OnlineEntry v-if="!gameVisible" @guest="showingLocalEntry = false" />
  <GameShell v-if="gameOpened" :visible="gameVisible" @back="showingLocalEntry = true" />
</template>
