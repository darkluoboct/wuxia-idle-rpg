import { onMounted, onUnmounted } from 'vue'
import type { MainTab, useGameStore } from '@/stores/gameStore'

export function useGameHotkeys(
  store: ReturnType<typeof useGameStore>,
  enabled: () => boolean,
  tabs: () => readonly { key: MainTab; hotkey: string }[],
) {
  function handleKeydown(event: KeyboardEvent) {
    if (!enabled() || event.defaultPrevented || document.querySelector('dialog[open], [aria-modal="true"], .item-popover')) return
    if (event.key === 'Escape') {
      store.mobileDrawer = 'NONE'
      return
    }
    const target = event.target as HTMLElement | null
    if (target?.isContentEditable || target?.matches('input, textarea, select') || event.ctrlKey || event.metaKey || event.altKey) return
    const tab = tabs().find(({ hotkey }) => hotkey === event.key)
    if (tab) store.selectTab(tab.key)
    else if (event.code === 'Space' && store.activeBattle && !target?.closest('button, summary, a')) {
      event.preventDefault()
      if (store.isBattlePlaying) store.skipBattleToEnd()
      else store.closeBattleStage()
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
}
