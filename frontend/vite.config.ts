/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const gameServer = process.env.WUXIA_GAME_SERVER ?? 'http://127.0.0.1:8080'

// 试玩与联机复用静态图片，试玩脚本及入口放在独立目录。
const guestEntry: Plugin = {
  name: 'wuxia-guest-entry',
  generateBundle: {
    order: 'post',
    handler(_, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') this.error('未生成试玩入口')
      delete bundle['index.html']
      html.fileName = 'guest/index.html'
      bundle[html.fileName] = html
    },
  },
}

export default defineConfig(({ mode, command, isPreview }) => {
  const guest = mode === 'guest'
  const online = command === 'build' && mode === 'online'
  if (!isPreview) execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/optimize_assets.mjs')], { stdio: 'inherit' })
  return {
  plugins: [vue(), tailwindcss(), guest && guestEntry],
  resolve: {
    alias: [
      ...(online ? [
        { find: '@/network/mockEngine', replacement: path.resolve(__dirname, 'src/network/mockEngine.noop.ts') },
        { find: '@/stores/localGame', replacement: path.resolve(__dirname, 'src/stores/localGame.online.ts') },
      ] : []),
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  build: {
    assetsInlineLimit: (filename) => filename.endsWith('.webp') ? false : undefined,
    emptyOutDir: !guest,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        ...(!guest && { admin: path.resolve(__dirname, 'admin.html') }),
      },
      output: {
        ...(guest && { entryFileNames: 'guest/assets/[name]-[hash].js', chunkFileNames: 'guest/assets/[name]-[hash].js' }),
        manualChunks(id) {
          if (/\/node_modules\/(vue\/|@vue\/|pinia\/)/.test(id)) return 'vendor-vue'
          if (id.includes('/node_modules/lucide-vue-next/')) return 'vendor-icons'
          if (id.endsWith('/shared/player.ts')) return 'player-rules'
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [searchForWorkspaceRoot(__dirname), path.resolve(__dirname, '../shared')] },
    proxy: {
      '/api': {
        target: gameServer,
        changeOrigin: true,
      },
      '/ws': {
        target: gameServer.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  }
})
