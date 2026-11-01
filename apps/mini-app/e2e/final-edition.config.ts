import {defineConfig} from '@playwright/test';
import base from './narrative.config';
export default defineConfig({...base,outputDir:'../test-results-final-edition',testMatch:'final-edition.scenario.ts',webServer:[
 {command:'cd ../packages/server && PORT=8096 pnpm exec tsx ../../e2e/test-server.ts',url:'http://localhost:8096/api/health',reuseExistingServer:false,timeout:60000},
 {command:'cd ../packages/client && API_PORT=8096 pnpm exec vite --port 5196 --strictPort',url:'http://localhost:5196',reuseExistingServer:false,timeout:60000},
],use:{...base.use,baseURL:'http://localhost:5196'}});
