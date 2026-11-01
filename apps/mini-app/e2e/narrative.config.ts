import { defineConfig } from '@playwright/test';
import legacy from './playwright.config';
export default defineConfig({ ...legacy, outputDir: '../test-results-narrative', testMatch: 'narrative.scenario.ts', webServer: [
  { command: 'cd ../packages/server && PORT=8092 pnpm exec tsx ../../e2e/test-server.ts', url: 'http://localhost:8092/api/health', reuseExistingServer: false, timeout: 60000 },
  { command: 'cd ../packages/client && API_PORT=8092 pnpm exec vite --port 5192 --strictPort', url: 'http://localhost:5192', reuseExistingServer: false, timeout: 60000 },
], use: { ...legacy.use, baseURL: 'http://localhost:5192', actionTimeout: 10000 } });
