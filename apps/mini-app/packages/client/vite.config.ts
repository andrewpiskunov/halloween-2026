import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Порт сервера ярмарки для прокси разработки; по умолчанию 8080.
const apiPort = process.env.API_PORT ?? '8080';
// Базовый путь сборки: «/fair/», когда приложение живёт под путём домена; в разработке «/».
const basePath = process.env.BASE_PATH ?? '/';

const portraitDir = new URL('./public/assets/portraits/', import.meta.url);
const portraits = Object.fromEntries(readdirSync(portraitDir).filter(f => f.endsWith('.jpg')).map(f => [f.slice(0, -4), createHash('sha256').update(readFileSync(new URL(f, portraitDir))).digest('hex').slice(0, 12)]));

export default defineConfig({
  define: { __PORTRAIT_REVISIONS__: JSON.stringify(portraits) },
  base: basePath,
  plugins: [preact()],
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
    },
  },
  test: { environment: 'node' },
});
