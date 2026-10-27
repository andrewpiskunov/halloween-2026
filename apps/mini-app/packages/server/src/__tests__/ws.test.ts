import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import type { WebSocketServer } from 'ws';
import type { Config } from '../config';
import { EventStore } from '../store';
import { Game } from '../game';
import { buildApp } from '../http';
import { attachWs, closeWs } from '../ws';
import { content, empty, nextCmd, gm } from './fixtures';

const config: Config = {
  botToken: '', botName: 'test_bot', sessionSecret: 'test', clientUrl: 'http://localhost',
  dbPath: ':memory:', contentPath: '', port: 0, allowDevAuth: true, botPolling: false,
};

type Msg = { kind: string; [key: string]: unknown };

/** Клиент WS с очередью входящих сообщений и ожиданием по условию. */
class Client {
  readonly ws: WebSocket;
  private readonly inbox: Msg[] = [];
  private waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  readonly opened: Promise<void>;
  readonly closed: Promise<number>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => { this.ws.once('open', () => resolve()); this.ws.once('error', reject); });
    this.closed = new Promise(resolve => this.ws.once('close', code => resolve(code)));
    this.ws.on('message', data => {
      const m = JSON.parse(String(data)) as Msg;
      const w = this.waiters.find(x => x.pred(m));
      if (w) { this.waiters = this.waiters.filter(x => x !== w); w.resolve(m); } else this.inbox.push(m);
    });
  }

  next(pred: (m: Msg) => boolean = () => true, timeoutMs = 2000): Promise<Msg> {
    const i = this.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('нет ожидаемого сообщения')), timeoutMs);
      this.waiters.push({ pred, resolve: m => { clearTimeout(timer); resolve(m); } });
    });
  }

  send(msg: unknown): void { this.ws.send(JSON.stringify(msg)); }

  async cmd(id: string, cmd: unknown): Promise<Msg> {
    this.send({ kind: 'cmd', id, cmd });
    return this.next(m => m.kind === 'result' && m.id === id);
  }
}

let store: EventStore;
let game: Game;
let app: FastifyInstance;
let wss: WebSocketServer;
let base: string;
let wsBase: string;
const clients: Client[] = [];

let counter = 0;
// Управляемые часы: тест истечения предложений сдвигает время вперёд.
const clock = { now: Date.now() };
const now = () => clock.now;
const opts = { now, newId: () => `id${++counter}`, random: () => 0.5 };

async function devAuth(userId: number, startParam?: string): Promise<{ token: string; actor: unknown; botName: string }> {
  const res = await fetch(`${base}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dev: startParam === undefined ? { userId } : { userId, startParam } }),
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ token: string; actor: unknown; botName: string }>;
}

function connect(token: string): Client {
  const c = new Client(`${wsBase}/ws?token=${encodeURIComponent(token)}`);
  clients.push(c);
  return c;
}

let o6: Client;
let o1: Client;

beforeAll(async () => {
  store = new EventStore(':memory:');
  game = Game.open(store, content, opts);
  app = buildApp({ game, content, config, now });
  wss = attachWs(app.server, { game, content, config, now });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;

  // Ведущий входит по своему коду и готовит ярмарку.
  const gmAuth = await devAuth(1000, game.gmCode());
  expect(gmAuth.actor).toEqual({ type: 'gm' });
  expect((await game.submit(nextCmd(), { type: 'session.setN', n: 12 }, gm)).ok).toBe(true);
  for (const roleKey of game.state().roster) {
    expect((await game.submit(nextCmd(), { type: 'player.setPresent', roleKey, present: true }, gm)).ok).toBe(true);
  }
  expect((await game.submit(nextCmd(), { type: 'session.open' }, gm)).ok).toBe(true);

  const codes = await (await fetch(`${base}/api/dev/codes`)).json() as { gm: string; roles: Record<string, string> };
  expect(codes.gm).toBe(game.gmCode());
  const a6 = await devAuth(1006, codes.roles.o6);
  const a1 = await devAuth(1001, codes.roles.o1);
  expect(a6).toMatchObject({ actor: { type: 'player', roleKey: 'o6' }, botName: 'test_bot' });
  expect(a1.actor).toEqual({ type: 'player', roleKey: 'o1' });
  o6 = connect(a6.token);
  o1 = connect(a1.token);
  await Promise.all([o6.opened, o1.opened]);
});

afterAll(async () => {
  for (const c of clients) c.ws.terminate();
  await closeWs(wss);
  await app.close();
  store.close();
});

test('health отдаёт seq; гость без роли получает токен и actor null', async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  expect(health).toEqual({ ok: true, seq: game.state().seq });
  const guest = await devAuth(5555);
  expect(guest.actor).toBeNull();
  expect(typeof guest.token).toBe('string');
  const bad = await fetch(`${base}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: 'hash=00&user=1' }),
  });
  expect(bad.status).toBe(401);
  expect(await bad.json()).toEqual({ error: 'unauthorized' });
});

test('подключение даёт view своей роли; offer.create у автора ok, адресат получает view с pending предложением', async () => {
  const v6 = await o6.next(m => m.kind === 'view');
  const v1 = await o1.next(m => m.kind === 'view');
  expect(v6).toMatchObject({ seq: game.state().seq, view: { kind: 'player', me: { role: { key: 'o6' } } } });
  expect(v1).toMatchObject({ view: { kind: 'player', me: { role: { key: 'o1' } } } });

  const r = await o6.cmd('offer-1', { type: 'offer.create', to: 'o1', give: { ...empty(), gold: 1 }, get: empty() });
  expect(r).toMatchObject({ kind: 'result', id: 'offer-1', ok: true });
  const fresh = await o1.next(m => m.kind === 'view' && (m.view as { offers: unknown[] }).offers.length > 0);
  expect(fresh.seq).toBe(r.seq);
  expect((fresh.view as { offers: { from: string; to: string; status: string }[] }).offers)
    .toEqual([expect.objectContaining({ from: 'o6', to: 'o1', status: 'pending' })]);
  // Автор тоже получает новую проекцию.
  await o6.next(m => m.kind === 'view' && m.seq === r.seq);
});

test('actor берётся из токена: игрок o6 не может выполнить gm.announce (forbidden)', async () => {
  const seq = game.state().seq;
  const r = await o6.cmd('announce-1', { type: 'gm.announce', text: 'Привет' });
  expect(r).toMatchObject({ kind: 'result', id: 'announce-1', ok: false, error: 'forbidden' });
  expect(game.state().seq).toBe(seq);
});

test('id клиента не совпадает с системными: команда с id expire:<offerId> не мешает tick закрыть предложение', async () => {
  const pending = Object.values(game.state().offers).find(o => o.status === 'pending')!;
  expect(pending).toBeDefined();
  const r = await o6.cmd(`expire:${pending.id}`, { type: 'offer.create', to: 'o1', give: { ...empty(), gold: 1 }, get: empty() });
  expect(r).toMatchObject({ id: `expire:${pending.id}`, ok: true });
  clock.now = pending.expiresAt + 1;
  game.tick();
  await o6.next(m => m.kind === 'view' && game.state().offers[pending.id].status !== 'pending');
  expect(game.state().offers[pending.id].status).toBe('expired');
});

test('одинаковый id от разных аккаунтов: выполняются обе команды', async () => {
  const count = store.all().length;
  const offer = (to: string) => ({ type: 'offer.create', to, give: { ...empty(), gold: 1 }, get: empty() });
  const [r6, r1] = await Promise.all([o6.cmd('same', offer('o1')), o1.cmd('same', offer('o6'))]);
  expect(r6).toMatchObject({ id: 'same', ok: true });
  expect(r1).toMatchObject({ id: 'same', ok: true });
  expect(r1.seq).not.toBe(r6.seq);
  expect(store.all().length).toBe(count + 2);
});

test('некорректное сообщение → invalid без событий в игре', async () => {
  const count = store.all().length;
  const r = await o6.cmd('x', { type: 'shop.buy', ingredient: { toString: 1 } });
  expect(r).toEqual({ kind: 'result', id: 'x', ok: false, error: 'invalid', detail: 'bad message' });
  const unknown = await o6.cmd('y', { type: 'no.such.command' });
  expect(unknown).toMatchObject({ ok: false, error: 'invalid', detail: 'bad message' });
  // Без корректного id сервер отвечает с id: null и не повторяет присланный id.
  o6.ws.send('не json');
  expect(await o6.next(m => m.kind === 'result' && m.id === null)).toMatchObject({ ok: false, error: 'invalid' });
  o6.send({ kind: 'cmd', id: 'z'.repeat(65), cmd: { type: 'act.next' } });
  expect(await o6.next(m => m.kind === 'result' && m.id === null)).toMatchObject({ ok: false, error: 'invalid' });
  expect(store.all().length).toBe(count);
});

test('ability.use с мусором в use → invalid, сокет жив, событий нет', async () => {
  const count = store.all().length;
  const bad = [
    { type: 'ability.use', use: 'мусор' },
    { type: 'ability.use', use: {} },
    { type: 'ability.use' },
    { type: 'ability.use', use: ['protectSelf'] },
    { type: 'ability.use', use: { kind: 42 } },
    { type: 'ability.use', use: { kind: 'stealGold', target: { toString: 1 } } },
    { type: 'ability.use', use: { kind: 'copyAbility', copy: 'grow' } },
    { type: 'ability.use', use: { kind: 'copyAbility', copy: { kind: 'discountOther', target: 7 } } },
    { type: 'ability.use', use: { kind: 'askYesNo', target: 'o1', question: 'в'.repeat(2001) } },
    { type: 'ability.use', use: { kind: 'protectSelf', guise: 'г'.repeat(2001) } },
  ];
  for (const [i, cmd] of bad.entries()) {
    const r = await o6.cmd(`bad-use-${i}`, cmd);
    expect(r).toMatchObject({ kind: 'result', ok: false, error: 'invalid' });
  }
  // В use допускаются только поля AbilityUse: облик Камня туда не входит при любой длине.
  const guise = await o6.cmd('long-guise', { type: 'ability.use', use: { kind: 'substituteIngredient', recipeId: 'cleanse', from: 'ash', to: 'dew', guise: 'г'.repeat(2000) } });
  expect(guise).toMatchObject({ ok: false, error: 'invalid', detail: 'bad message' });
  expect(o6.ws.readyState).toBe(WebSocket.OPEN);
  expect(store.all().length).toBe(count);
  // Сокет жив: следующая команда выполняется.
  const ok = await o6.cmd('after-bad', { type: 'ability.use', use: { kind: 'substituteIngredient', recipeId: 'cleanse', from: 'ash', to: 'moon' } });
  expect(ok).toMatchObject({ ok: false, error: 'insufficient' });
  expect(o6.ws.readyState).toBe(WebSocket.OPEN);
});

test('ведущий по WS получает GmView', async () => {
  const { token } = await devAuth(1000);
  const c = connect(token);
  const v = await c.next(m => m.kind === 'view');
  expect((v.view as { kind: string }).kind).toBe('gm');
  // Проекция ведущего крупная: сжатие договаривается при подключении.
  expect(c.ws.extensions).toContain('permessage-deflate');
  const sent = (v.view as { content: Record<string, unknown> }).content;
  expect(sent).not.toHaveProperty('roleByKey');
  expect(sent).not.toHaveProperty('recipeById');
});

test('невалидный token → закрытие 4401', async () => {
  const c = connect('bad');
  expect(await c.closed).toBe(4401);
});

test('гость без роли → закрытие 4403', async () => {
  const { token } = await devAuth(7777);
  const c = connect(token);
  expect(await c.closed).toBe(4403);
});

test('closeWs закрывает подключённых клиентов и завершается; после него app.close не зависает', async () => {
  const st = new EventStore(':memory:');
  const g = Game.open(st, content, opts);
  const deps = { game: g, content, config, now };
  const a = buildApp(deps);
  const w = attachWs(a.server, deps);
  await a.listen({ port: 0, host: '127.0.0.1' });
  const { port } = a.server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dev: { userId: 42, startParam: g.gmCode() } }),
  });
  const { token } = await res.json() as { token: string };
  const c = new Client(`ws://127.0.0.1:${port}/ws?token=${token}`);
  clients.push(c);
  await c.next(m => m.kind === 'view');

  const within = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('таймаут')), 1000))]);
  await within(closeWs(w));
  await within(c.closed);
  await within(a.close());
  st.close();
});

test('ведущий получает токен «за игрока» и видит его проекцию; игроку и за чужую роль отказ', async () => {
  const gmAuth = await devAuth(1000);
  const as = async (token: string, roleKey: string) => fetch(`${base}/api/gm/as`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, roleKey }),
  });
  const ok = await as(gmAuth.token, 'o6');
  expect(ok.status).toBe(200);
  const body = await ok.json() as { token: string; actor: unknown };
  expect(body.actor).toEqual({ type: 'player', roleKey: 'o6' });

  const c = connect(body.token);
  await c.opened;
  const view = await c.next(m => m.kind === 'view');
  expect((view.view as { kind: string; me: { role: { key: string } } }).me.role.key).toBe('o6');
  // Команда выполняется от имени Греты: покупка ингредиента списывает её золото
  const before = game.state().players.o6.gold;
  const r = await c.cmd('as-buy', { type: 'shop.buy', ingredient: 'dew' });
  expect(r.ok).toBe(true);
  expect(game.state().players.o6.gold).toBeLessThan(before);

  // Игрок не может получить токен за другого, ведущий не может взять роль вне состава
  const a1 = await devAuth(1001);
  expect((await as(a1.token, 'o6')).status).toBe(403);
  expect((await as(gmAuth.token, 'n18')).status).toBe(403);
  expect((await as('мусор', 'o6')).status).toBe(401);
});

// Последний тест файла: после сброса состояние общей игры начальное.
test('session.reset от ведущего: игроки теряют роль и соединение, ведущий получает проекцию setup, коды новые', async () => {
  const gmAuth = await devAuth(1000);
  expect(gmAuth.actor).toEqual({ type: 'gm' });
  const g = connect(gmAuth.token);
  await g.opened;
  await g.next(m => m.kind === 'view');
  const oldGm = game.gmCode();
  const oldO6 = game.state().invites.o6;

  const r = await g.cmd('reset-1', { type: 'session.reset' });
  expect(r).toMatchObject({ kind: 'result', id: 'reset-1', ok: true });
  expect(await o6.closed).toBe(4403);
  const view = await g.next(m => m.kind === 'view' && (m.view as { state: { phase: string } }).state.phase === 'setup');
  expect((view.view as { state: { roster: string[]; gmTelegramId?: number } }).state).toMatchObject({ roster: [], gmTelegramId: 1000 });
  expect(game.gmCode()).not.toBe(oldGm);
  expect(game.state().invites.o6).not.toBe(oldO6);
  expect(store.getMeta('gmCode')).toBe(game.gmCode());
  // Старый код игрока больше не действует, ведущий входит без кода.
  expect((await devAuth(1006, oldO6)).actor).toBeNull();
  expect((await devAuth(1000)).actor).toEqual({ type: 'gm' });
});
