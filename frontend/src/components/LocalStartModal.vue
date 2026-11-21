<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { OriginId } from '@/network/protocol'
import OriginPicker from './OriginPicker.vue'
import BaseModal from './ui/BaseModal.vue'

const store = useGameStore()
const currentSave = computed(() => store.savedGame?.playerId === store.player.id ? store.savedGame : null)
const pickingOrigin = ref(false)
const newOrigin = ref<OriginId>()
function startNewGame() {
  if (newOrigin.value) store.startGame('NEW', newOrigin.value)
}
</script>

<template>
  <BaseModal v-if="!store.gameMode" open title="选择开局" :close-on-backdrop="false" :close-on-esc="false" size="lg">
    <div class="space-y-4 p-5 md:p-6">
      <div class="text-center">
        <h2 class="font-brush text-4xl leading-tight text-gold">金庸群侠 · 问道武林</h2>
        <p class="hint mt-1">请选择你的江湖开局</p>
      </div>
      <!-- 继续上次的存档 -->
      <div v-if="currentSave" class="well flex flex-wrap items-center justify-between gap-3 p-4 border-gold">
        <div>
          <b class="font-brush text-2xl leading-none text-gold">继续江湖</b>
          <p class="mt-1 text-sm text-ink2">
            {{ currentSave.mode === 'NEW' ? '新游戏' : '演武模式' }} · Lv.{{ currentSave.level }} · 主线 {{ currentSave.node }} ·
            {{ new Date(currentSave.savedAt).toLocaleString() }}
          </p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm" title="删除本地存档" @click="store.deleteSave()">删除存档</button>
          <button class="btn btn-seal" @click="store.continueGame()">继续</button>
        </div>
      </div>
      <p v-if="store.savedGame" class="text-center text-xs text-cinnabar">开始新的游戏或演武模式，将覆盖浏览器中的试玩存档。</p>
      <form v-if="pickingOrigin" class="space-y-3" @submit.prevent="startNewGame">
        <OriginPicker v-model="newOrigin" />
        <div class="flex justify-end gap-2">
          <button type="button" class="btn" @click="pickingOrigin = false">返回</button>
          <button type="submit" class="btn btn-seal" :disabled="!newOrigin">启程</button>
        </div>
      </form>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <button class="well well-hover flex flex-col gap-2 p-4 text-left" @click="pickingOrigin = true">
          <span class="flex items-center gap-2"><span class="seal h-8 w-8 text-lg">新</span><b class="font-brush text-2xl leading-none">新游戏</b></span>
          <span class="text-sm leading-relaxed text-ink2">
            Lv.1 起步，先选家世，家人伙伴陪你入世。其余伙伴靠剧情结识、在客栈以诚相交，好感随章节推进抬高上限，送礼每日有数。
          </span>
          <span class="chip chip-gold self-start">正式规则</span>
        </button>
        <button class="well well-hover flex flex-col gap-2 p-4 text-left" @click="store.startGame('DEMO')">
          <span class="flex items-center gap-2"><span class="seal h-8 w-8 text-lg">演</span><b class="font-brush text-2xl leading-none">演武模式</b></span>
          <span class="text-sm leading-relaxed text-ink2">
            Lv.32，七位伙伴已就位，无送礼与好感限制，可直接体验武库、门派、市井全部玩法。
          </span>
          <span class="chip self-start">体验用 · 后续版本移除</span>
        </button>
      </div>
    </div>
  </BaseModal>
</template>
