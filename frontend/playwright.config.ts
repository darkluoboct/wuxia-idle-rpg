import { defineConfig } from '@playwright/test'

const externalBaseURL = process.env.WUXIA_E2E_BASE_URL
const baseURL = externalBaseURL ?? 'http://127.0.0.1:5181'
const database = process.env.WUXIA_E2E_DATABASE_URL
const gameServer = 'http://127.0.0.1:8181'

export default defineConfig({
  testDir: './e2e',
  outputDir: '../output/playwright/results',
  forbidOnly: !!process.env.CI,
  use: { baseURL, trace: 'retain-on-failure', locale: 'zh-CN', timezoneId: 'Asia/Singapore' },
  webServer: [
    ...(database
      ? [
          {
            command: 'pnpm migrate && pnpm start',
            cwd: '../server',
            port: 8181,
            env: { DATABASE_URL: database, PORT: '8181', APP_ORIGIN: baseURL },
          },
        ]
      : []),
    ...(externalBaseURL
      ? []
      : [
          {
            command: 'pnpm preview --host 127.0.0.1 --port 5181 --strictPort',
            url: baseURL,
            env: { WUXIA_GAME_SERVER: gameServer },
          },
        ]),
  ],
})
