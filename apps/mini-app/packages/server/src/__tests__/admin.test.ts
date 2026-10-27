import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import type { WebSocketServer } from 'ws';
import type { Config } from '../config';
import { EventStore } from '../store';
import { Game } from '../game';
import { buildApp } from '../http';
import { attachWs, closeWs } from '../ws';
import { content, openFair, testOpts } from './fixtures';

const SECRET = 'test-admin-secret';
const config: Config = {
  botToken: '', botName: 'test_bot', sessionSecret: SECRET, clientUrl: 'http://localhost',
  dbPath: ':memory:', contentPath: '', port: 0, allowDevAuth: true, botPolling: false,
};

const GM_ID = 4242;

let store: EventStore;
let game: Game;
let app: FastifyInstance;
let wss: WebSocketServer;
let base: string;
let wsBase: string;
const sockets: WebSocket[] = [];

// Сервер пишет в консоль об игре «за игрока»; в тесте это шум.
const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

async function devAuth(userId: number, startParam?: string): Promise<{ token: string; actor: unknown }> {
  const res = await post('/api/auth', { dev: startParam === undefined ? { userId } : { userId, startParam } });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ token: string; actor: unknown }>;
}

/** Сокет, открытый и получивший первую проекцию; closed — код закрытия. */
async function open(token: string): Promise<{ ws: WebSocket; closed: Promise<number> }> {
  const ws = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(token)}`);
  sockets.push(ws);
  const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.on('message', data => { if ((JSON.parse(String(data)) as { kind: string }).kind === 'view') resolve(); });
    ws.once('error', reject);
  });
  return { ws, closed };
}

const reissue = (headers: Record<string, string> = {}) => post('/api/admin/gm-reissue', {}, headers);

beforeAll(async () => {
  store = new EventStore(':memory:');
  // Коды из UUID, как в бою: длина пересданного кода сравнивается с кодами приглашений.
  game = Game.open(store, content, { ...testOpts(), newId: () => randomUUID() });
  const deps = { game, store, content, config, now: () => Date.now() };
  app = buildApp(deps);
  wss = attachWs(app.server, deps);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
  expect((await devAuth(GM_ID, game.gmCode())).actor).toEqual({ type: 'gm' });
  await openFair(game);
});

afterAll(async () => {
  for (const ws of sockets) ws.terminate();
  await closeWs(wss);
  await app.close();
  store.close();
  quiet.mockRestore();
});

test('пересдача кода ведущего: без заголовка, с пустым и с неверным секретом 403, состояние не меняется', async () => {
  const before = game.state();
  for (const headers of [{} as Record<string, string>, { 'x-admin-secret': '' }, { 'x-admin-secret': 'wrong' }, { 'x-admin-secret': `${SECRET}x` }]) {
    const res = await reissue(headers);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  }
  expect(game.state()).toBe(before);
  expect(game.gmCode()).toBe(before.gmCode);
  expect(game.state().gmTelegramId).toBe(GM_ID);
});

test('пересдача кода ведущего с верным секретом: 200 { code }, ведущий отвязан, его сокеты закрыты 4403', async () => {
  const { token } = await devAuth(GM_ID);
  const gmSock = await open(token);
  const asRes = await post('/api/gm/as', { token, roleKey: game.state().roster[0] });
  expect(asRes.status).toBe(200);
  const asSock = await open(((await asRes.json()) as { token: string }).token);
  const oldCode = game.gmCode();
  const inviteLength = Object.values(game.state().invites)[0].length;

  const res = await reissue({ 'X-Admin-Secret': SECRET });
  expect(res.status).toBe(200);
  const { code } = await res.json() as { code: string };
  expect(code).toBe(game.gmCode());
  expect(code).not.toBe(oldCode);
  expect(code.length).toBe(inviteLength);
  expect(game.state().gmTelegramId).toBeUndefined();
  expect(store.getMeta('gmCode')).toBe(code);

  expect(await gmSock.closed).toBe(4403);
  expect(await asSock.closed).toBe(4403);

  // Старый код не действует, новый возвращает ведущего (в том числе на другом аккаунте).
  expect((await devAuth(9999, oldCode)).actor).toBeNull();
  expect((await devAuth(GM_ID + 1, code)).actor).toEqual({ type: 'gm' });
});

test('health: с dev-входом память числами, без него поля memory нет', async () => {
  const withDev = await (await fetch(`${base}/api/health`)).json() as { ok: boolean; seq: number; memory: { rss: number; heapUsed: number } };
  expect(withDev).toMatchObject({ ok: true, seq: game.state().seq });
  expect(withDev.memory.rss).toBeGreaterThan(0);
  expect(withDev.memory.heapUsed).toBeGreaterThan(0);
  expect(Object.keys(withDev.memory).sort()).toEqual(['heapUsed', 'rss']);

  const prod = buildApp({ game, store, content, config: { ...config, allowDevAuth: false }, now: () => Date.now() });
  const res = await prod.inject({ method: 'GET', url: '/api/health' });
  expect(res.json()).toEqual({ ok: true, seq: game.state().seq });
  await prod.close();
});
