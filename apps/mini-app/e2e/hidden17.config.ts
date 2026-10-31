import { defineConfig } from '@playwright/test';
import legacy from './playwright.config';
export default defineConfig({ ...legacy, testMatch: 'hidden17.scenario.ts', webServer: [
  { command: 'cd ../packages/server && DB_PATH=:memory: FAIR_NARRATIVE=legacy ALLOW_DEV_AUTH=1 SESSION_SECRET=test PORT=8091 pnpm exec tsx src/index.ts', url: 'http://localhost:8091/api/health', reuseExistingServer: false, timeout: 60000 },
  { command: 'cd ../packages/client && API_PORT=8091 pnpm exec vite --port 5191 --strictPort', url: 'http://localhost:5191', reuseExistingServer: false, timeout: 60000 },
] });
