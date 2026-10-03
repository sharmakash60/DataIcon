import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../tests/e2e',
  outputDir: '../test-results',
  use: { baseURL: process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
