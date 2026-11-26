import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 4173)
const baseURL = `http://127.0.0.1:${port}`
const reuseExistingOnly = process.env.E2E_REUSE_ONLY === '1'
const mesa = process.env.E2E_MESA === '1'

export default defineConfig({
  testDir: './tests/e2e',
  // 上游其他玩法的历史用例仍然保留，默认验收当前单人入口。
  testMatch: 'yingzhou*.spec.ts',
  // 响应式验收截图保存在 test-results/responsive-*；运行 E2E 时只清理自己的子目录。
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // 多主题用例同时创建 WebGL 牌桌，限制本机并发避免争抢显存。
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL,
    channel: 'chromium',
    // Linux CI runs a full Chromium window on Xvfb with Mesa's OpenGL driver.
    headless: !mesa,
    launchOptions: { args: mesa
      ? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']
      : ['--enable-gpu'] },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: reuseExistingOnly ? undefined : [
    {
      command: `npm run dev -- --port ${port}`,
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
