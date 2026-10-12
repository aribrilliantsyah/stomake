import { defineConfig } from '@playwright/test';

const home = `/tmp/storyboard-e2e-${process.pid}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5197', channel: 'chrome' },
  webServer: {
    command: `rm -rf ${home} && pnpm build && STORYBOARD_HOME=${home} NODE_ENV=production PORT=5197 pnpm exec tsx src/server/main.ts`,
    url: 'http://127.0.0.1:5197/api/projects',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
