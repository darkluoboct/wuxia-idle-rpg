<script setup lang="ts">
import { useGameUiStore } from '@/stores/gameUiStore'
import BaseModal from './ui/BaseModal.vue'

const store = useGameUiStore()
</script>

<template>
  <BaseModal v-if="store.confirmDialog" open role="alertdialog" :title="store.confirmDialog.title" size="sm" @close="store.resolveConfirm(false)">
    <div class="space-y-3 p-5">
      <h4 class="font-brush text-2xl leading-tight" :class="store.confirmDialog.tone === 'danger' ? 'text-cinnabar' : 'text-gold'">
        {{ store.confirmDialog.title }}
      </h4>
      <p class="text-sm leading-relaxed text-ink2">{{ store.confirmDialog.body }}</p>
      <div class="flex justify-end gap-2 pt-1">
        <button autofocus class="btn" @click="store.resolveConfirm(false)">取消</button>
        <button class="btn" :class="store.confirmDialog.tone === 'danger' ? 'btn-seal' : 'btn-gold'" @click="store.resolveConfirm(true)">
          {{ store.confirmDialog.confirmText }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
