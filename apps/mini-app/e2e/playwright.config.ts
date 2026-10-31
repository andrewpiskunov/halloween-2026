import { defineConfig } from '@playwright/test';

// Порты выбраны нестандартными, чтобы не пересекаться с обычной разработкой (8080/5173).
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5191', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'cd ../packages/server && FAIR_RULESET=legacy DB_PATH=:memory: ALLOW_DEV_AUTH=1 SESSION_SECRET=test PORT=8091 pnpm exec tsx src/index.ts',
      url: 'http://localhost:8091/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'cd ../packages/client && API_PORT=8091 pnpm exec vite --port 5191 --strictPort',
      url: 'http://localhost:5191',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
