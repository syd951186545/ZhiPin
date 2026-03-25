import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      scale: 'css',
    },
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO || 0),
    },
  },
  projects: [
    {
      name: 'mock-e2e',
      grepInvert: /@smoke-real/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      // smoke: Mock E2E 完整用户旅程测试（快速，上线前必须通过）
      name: 'smoke',
      grep: /@smoke/,
      grepInvert: /@smoke-real/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'smoke-real',
      grep: /@smoke-real/,
      timeout: 300_000, // 5 分钟 - 真实工作流执行时间
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'platform-config',
      grep: /@platform-config/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'execution',
      grep: /@execution/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    cwd: __dirname,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
