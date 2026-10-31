import { defineConfig } from '@playwright/test';
import legacy from './playwright.config';
export default defineConfig({ ...legacy, outputDir: '../test-results-narrative', testMatch: 'narrative.scenario.ts', webServer: [
  { command: 'cd ../packages/server && DB_PATH=:memory: ALLOW_DEV_AUTH=1 SESSION_SECRET=test PORT=8092 pnpm exec tsx src/index.ts', url: 'http://localhost:8092/api/health', reuseExistingServer: false, timeout: 60000 },
  { command: 'cd ../packages/client && API_PORT=8092 pnpm exec vite --port 5192 --strictPort', url: 'http://localhost:5192', reuseExistingServer: false, timeout: 60000 },
], use: { ...legacy.use, baseURL: 'http://localhost:5192', actionTimeout: 10000 } });
