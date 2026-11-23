<script setup lang="ts">
import { Maximize2, X } from 'lucide-vue-next'
import { useInterfacePrefs } from '@/stores/interfacePrefs'
import { useFullscreen } from '@/composables/useFullscreen'
import BaseModal from './ui/BaseModal.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const prefs = useInterfacePrefs()
const { fullscreenError, toggleFullscreen } = useFullscreen()
</script>

<template>
  <BaseModal :open="open" title="界面设置" size="sm" @close="emit('close')">
    <div class="space-y-4 p-5">
      <header class="flex items-center justify-between gap-3 border-b border-line pb-3">
        <h2 class="font-brush text-2xl text-gold">界面设置</h2>
        <button class="btn btn-sm" type="button" aria-label="关闭界面设置" autofocus @click="emit('close')"><X :size="18" /></button>
      </header>
      <label class="flex items-center justify-between gap-3">界面主题
        <select v-model="prefs.isMidnightTheme" class="field" aria-label="界面主题">
          <option :value="false">宋宣</option>
          <option :value="true">玄墨</option>
        </select>
      </label>
      <label class="flex items-center justify-between gap-3">场景动态
        <input v-model="prefs.sceneMotion" class="h-5 w-5 accent-gold" type="checkbox" />
      </label>
      <label class="flex items-center justify-between gap-3">关卡剧情
        <select v-model="prefs.stageScripts" class="field" aria-label="关卡剧情">
          <option value="FULL">完整演出</option>
          <option value="AFTER">只看关后结语</option>
          <option value="OFF">关闭</option>
        </select>
      </label>
      <button class="btn w-full" type="button" @click="toggleFullscreen"><Maximize2 :size="16" aria-hidden="true" />切换全屏</button>
      <p v-if="fullscreenError" class="text-sm text-cinnabar" role="status">{{ fullscreenError }}</p>
    </div>
  </BaseModal>
</template>
