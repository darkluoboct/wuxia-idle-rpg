/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const gameServer = process.env.WUXIA_GAME_SERVER ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
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
})
