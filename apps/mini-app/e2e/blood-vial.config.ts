import { defineConfig } from '@playwright/test';
import gm from './gm-workspace.config';
export default defineConfig({ ...gm, testMatch: 'blood-vial.scenario.ts' });
