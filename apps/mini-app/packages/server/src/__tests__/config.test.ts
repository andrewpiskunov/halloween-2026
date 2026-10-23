import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { defaultContentPath } from '@fair/shared/node';
import { loadConfig, parseEnvFile } from '../config';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });
const missing = '/нет/такого/.env';

test('значения по умолчанию как в .env.example; без секрета и без dev-входа — ошибка', () => {
  expect(() => loadConfig({}, missing)).toThrow(/SESSION_SECRET/);
  const c = loadConfig({ SESSION_SECRET: 's' }, missing);
  expect(c).toEqual({
    botToken: '', botName: '', sessionSecret: 's', clientUrl: '', dbPath: './data/session.sqlite',
    contentPath: defaultContentPath(), port: 8080, allowDevAuth: false, botPolling: false,
  });
});

test('dev-вход без секрета: фиксированный секрет и предупреждение', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const c = loadConfig({ ALLOW_DEV_AUTH: '1' }, missing);
  expect(c.allowDevAuth).toBe(true);
  expect(c.sessionSecret.length).toBeGreaterThan(0);
  expect(warn).toHaveBeenCalled();
});

test('.env читается, переменные окружения важнее', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fair-env-'));
  dirs.push(dir);
  const file = join(dir, '.env');
  writeFileSync(file, '# комментарий\nSESSION_SECRET=из-файла\nPORT=9090\nBOT_NAME="fake_bot"\n\nBOT_POLLING=1\n');
  expect(parseEnvFile(file)).toMatchObject({ SESSION_SECRET: 'из-файла', PORT: '9090', BOT_NAME: 'fake_bot' });
  const c = loadConfig({ PORT: '7070' }, file);
  expect(c).toMatchObject({ sessionSecret: 'из-файла', port: 7070, botName: 'fake_bot', botPolling: true });
});
