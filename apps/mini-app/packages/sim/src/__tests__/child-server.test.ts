import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { startChildServer } from '../child-server';

const dir = mkdtempSync(join(tmpdir(), 'fair-sim-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('нет исполняемого файла — запуск отклонён с понятным сообщением', async () => {
  await expect(startChildServer({ dbPath: join(dir, 'x.sqlite'), bin: join(dir, 'нет-такого-tsx') }))
    .rejects.toThrow(/не удалось запустить .*нет-такого-tsx/);
});

test('сервер поднимается, отвечает на /api/health и останавливается по SIGTERM', async () => {
  const dbPath = join(dir, 'ok.sqlite');
  const server = await startChildServer({ dbPath });
  const health = await (await fetch(`${server.baseUrl}/api/health`)).json() as { ok: boolean };
  expect(health.ok).toBe(true);
  await server.stop();
  await server.stop();
  await expect(fetch(`${server.baseUrl}/api/health`)).rejects.toThrow();
  expect(existsSync(dbPath)).toBe(true);
}, 30_000);
