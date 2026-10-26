import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Порт сервера ярмарки для прокси разработки; по умолчанию 8080.
const apiPort = process.env.API_PORT ?? '8080';
// Базовый путь сборки: «/fair/», когда приложение живёт под путём домена; в разработке «/».
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
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
