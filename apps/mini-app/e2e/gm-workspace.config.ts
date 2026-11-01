import { defineConfig } from '@playwright/test';
import narrative from './narrative.config';
export default defineConfig({ ...narrative, outputDir: '../test-results-gm-workspace', testMatch: 'gm-workspace.scenario.ts', webServer: [
 { command: 'cd ../packages/server && DB_PATH=:memory: ALLOW_DEV_AUTH=1 SESSION_SECRET=test PORT=8094 pnpm exec tsx src/index.ts', url: 'http://localhost:8094/api/health', reuseExistingServer: false, timeout: 60000 },
 { command: 'cd ../packages/client && API_PORT=8094 pnpm exec vite --port 5194 --strictPort', url: 'http://localhost:5194', reuseExistingServer: false, timeout: 60000 },
], use: { ...narrative.use, baseURL: 'http://localhost:5194', actionTimeout: 10000 } });
