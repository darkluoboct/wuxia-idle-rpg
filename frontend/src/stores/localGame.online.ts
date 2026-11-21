import { computed, ref } from 'vue'
import type { useLocalGame as useGuestGame } from './localGame'

export function useLocalGame(): ReturnType<typeof useGuestGame> {
  function unavailable(): never { throw new Error('试玩存档只在游客入口开放') }
  return {
    startGame: unavailable,
    continueGame: unavailable,
    backToTitle: unavailable,
    deleteSave: unavailable,
    saveNow: () => undefined,
    savedGame: ref(null),
    characterList: computed(() => []),
    selectLocalCharacter: unavailable,
    createLocalCharacter: unavailable,
    deleteLocalCharacter: unavailable,
  }
}
