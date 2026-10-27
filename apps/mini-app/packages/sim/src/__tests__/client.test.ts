import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import WebSocket from 'ws';
import type { GmView } from '@fair/shared';
import { fetchCodes, openBot, type BotConn } from '../client';
import { startServer, type TestServer } from './server-fixture';

let server: TestServer;
let base: string;
const bots: BotConn[] = [];

beforeAll(async () => {
  server = await startServer();
  base = server.base;
});

afterAll(async () => {
  for (const b of bots) b.close();
  await server.close();
});

test('ведущий входит по коду, команда возвращает результат, waitSeq дожидается проекции', async () => {
  const codes = await fetchCodes(base);
  expect(typeof codes.gm).toBe('string');
  const bot = await openBot(base, 100, codes.gm);
  bots.push(bot);
  expect(bot.actor).toEqual({ type: 'gm' });
  expect(bot.view().kind).toBe('gm');
  expect(bot.maxViewBytes()).toBeGreaterThan(0);
  // Содержимое с тайнами приходит только ведущему.
  expect(bot.content()?.roles.length).toBeGreaterThan(0);

  const r = await bot.send({ type: 'session.setN', n: 12 });
  expect(r.ok).toBe(true);
  expect(typeof r.seq).toBe('number');
  expect(r.ms).toBeGreaterThanOrEqual(0);
  await bot.waitSeq(r.seq!);
  expect(bot.seq()).toBeGreaterThanOrEqual(r.seq!);
  expect((bot.view() as GmView).state.roster).toHaveLength(12);

  // Коды ролей появляются после состава; игрок входит и видит свою роль без telegramId.
  const roles = (await fetchCodes(base)).roles;
  const o1 = await openBot(base, 1001, roles.o1);
  bots.push(o1);
  expect(o1.actor).toEqual({ type: 'player', roleKey: 'o1' });
  expect(JSON.stringify(o1.view())).not.toContain('telegramId');
  expect(o1.content()).toBeNull();
});

/** Ведущий со своим соединением: тесты не делят ботов. */
async function gmBot(): Promise<BotConn> {
  const bot = await openBot(base, 100, (await fetchCodes(base)).gm);
  bots.push(bot);
  return bot;
}

test('ошибка команды приходит с кодом, ожидание без проекции завершается по таймауту', async () => {
  const bot = await gmBot();
  const r = await bot.send({ type: 'session.setN', n: 7 });
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe('string');
  await expect(bot.waitSeq(bot.seq() + 100, 50)).rejects.toThrow(/seq/);
});

test('вход с неверным кодом отклоняется понятной ошибкой', async () => {
  await expect(openBot(base, 2000, 'нет-такого-кода')).rejects.toThrow(/роль/);
});

test('close() сразу отклоняет ожидания и последующие команды, повторный close безопасен', async () => {
  const bot = await gmBot();
  const waiting = bot.waitSeq(bot.seq() + 100);
  bot.close();
  await expect(waiting).rejects.toThrow(/закрыто/);
  await expect(bot.send({ type: 'clock.pause' })).rejects.toThrow(/закрыто/);
  expect(() => bot.close()).not.toThrow();
});

test('два соединения одного аккаунта дают разные id команд при одинаковом локальном номере', async () => {
  const first = await gmBot();
  const second = await gmBot();
  const sent = vi.spyOn(WebSocket.prototype, 'send');
  try {
    // У обоих это первая команда соединения. Без префикса id совпали бы, и сервер вернул бы второму
    // запомненный отказ первого вместо выполнения.
    const refused = await first.send({ type: 'session.setN', n: 7 });
    const done = await second.send({ type: 'gm.announce', text: 'Проверка id команд.' });
    expect(refused.ok).toBe(false);
    expect(done.ok).toBe(true);
    // Шпион видит и отправки сервера в том же процессе: берутся только команды ботов.
    const ids = sent.mock.calls
      .map(([data]) => JSON.parse(String(data)) as { kind: string; id: string })
      .filter(m => m.kind === 'cmd')
      .map(m => m.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.map(id => id.split(':').at(-1))).toEqual(['1', '1']);
  } finally {
    sent.mockRestore();
  }
});

// Последний тест: сервер рвёт все соединения.
test('сервер закрывает соединение: ожидающий waitSeq и последующий send отклоняются', async () => {
  const bot = await gmBot();
  const waiting = bot.waitSeq(bot.seq() + 100);
  for (const c of server.wss.clients) c.terminate();
  await expect(waiting).rejects.toThrow(/закрыто/);
  await expect(bot.send({ type: 'clock.pause' })).rejects.toThrow(/закрыто/);
});
