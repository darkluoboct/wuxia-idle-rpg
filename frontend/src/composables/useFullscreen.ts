import { ref } from 'vue'

export function useFullscreen() {
  const fullscreenError = ref('')
  async function toggleFullscreen() {
    fullscreenError.value = ''
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { fullscreenError.value = '当前窗口不支持全屏显示' }
  }
  return { fullscreenError, toggleFullscreen }
}
