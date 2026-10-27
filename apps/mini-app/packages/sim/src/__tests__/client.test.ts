import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { WebSocketServer } from 'ws';
import { loadContent, type GmView } from '@fair/shared';
import { defaultContentPath } from '@fair/shared/node';
import type { Config } from '@fair/server/src/config';
import { EventStore } from '@fair/server/src/store';
import { Game } from '@fair/server/src/game';
import { buildApp } from '@fair/server/src/http';
import { attachWs, closeWs } from '@fair/server/src/ws';
import { fetchCodes, openBot, type BotConn } from '../client';

const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));
const config: Config = {
  botToken: '', botName: 'test_bot', sessionSecret: 'test', clientUrl: 'http://localhost',
  dbPath: ':memory:', contentPath: '', port: 0, allowDevAuth: true, botPolling: false,
};

let store: EventStore;
let app: ReturnType<typeof buildApp>;
let wss: WebSocketServer;
let base: string;
const bots: BotConn[] = [];

beforeAll(async () => {
  let counter = 0;
  const now = () => Date.now();
  store = new EventStore(':memory:');
  const game = Game.open(store, content, { now, newId: () => `id${++counter}`, random: () => 0.5 });
  app = buildApp({ game, content, config, now });
  wss = attachWs(app.server, { game, content, config, now });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const b of bots) b.close();
  await closeWs(wss);
  await app.close();
  store.close();
});

test('ведущий входит по коду, команда возвращает результат, waitSeq дожидается проекции', async () => {
  const codes = await fetchCodes(base);
  expect(typeof codes.gm).toBe('string');
  const bot = await openBot(base, 100, codes.gm);
  bots.push(bot);
  expect(bot.actor).toEqual({ type: 'gm' });
  expect(bot.view().kind).toBe('gm');
  expect(bot.maxViewBytes()).toBeGreaterThan(0);

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

// Последний тест: сервер рвёт все соединения.
test('сервер закрывает соединение: ожидающий waitSeq и последующий send отклоняются', async () => {
  const bot = await gmBot();
  const waiting = bot.waitSeq(bot.seq() + 100);
  for (const c of wss.clients) c.terminate();
  await expect(waiting).rejects.toThrow(/закрыто/);
  await expect(bot.send({ type: 'clock.pause' })).rejects.toThrow(/закрыто/);
});
