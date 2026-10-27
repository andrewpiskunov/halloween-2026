import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ContentData, GmView, PlayerView } from '@fair/shared';
import { rootScreen } from '../rules';
import { retryLogin, start, status } from '../store';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'query_id=x' } } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('вход без сети: статус auth_failed, «Повторить» запускает вход снова', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetch);
  await start();
  expect(status.value).toBe('auth_failed');
  expect(fetch).toHaveBeenCalledTimes(1);
  await retryLogin();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(status.value).toBe('auth_failed');
});

test('ответ сервера не 200: тоже auth_failed; 401 — unauthorized', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 502, ok: false }));
  await retryLogin();
  expect(status.value).toBe('auth_failed');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
  await retryLogin();
  expect(status.value).toBe('unauthorized');
});

const gm = { kind: 'gm' } as GmView;
const player = { kind: 'player' } as PlayerView;
const content = { roles: [] } as unknown as ContentData;

test('корень: проекция ведущего без содержимого ждёт, а не падает (Review Focus 3)', () => {
  expect(rootScreen('open', gm, null)).toBe('connecting');
  expect(rootScreen('open', gm, content)).toBe('app');
  expect(rootScreen('open', player, null)).toBe('app');
  expect(rootScreen('connecting', null, null)).toBe('connecting');
  // обрыв при уже показанных экранах: экраны остаются, сверху полоса
  expect(rootScreen('closed', player, null)).toBe('app');
});

test('корень: экраны отказа, с кнопкой «Повторить» и без', () => {
  expect(rootScreen('auth_failed', null, null)).toBe('auth_failed');
  expect(rootScreen('unauthorized', player, null)).toBe('unauthorized');
  expect(rootScreen('no_auth', null, null)).toBe('no_auth');
  expect(rootScreen('no_role', null, null)).toBe('no_role');
});
