import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Command } from '@fair/shared';
import type { Config } from '../config';
import { EventStore } from '../store';
import { Game, type GameOpts } from '../game';
import { buildApp } from '../http';
import { buildExport, exportFileName, stripPersonal, writeExportOnClose, type Export } from '../export';
import { content, gm, nextCmd } from './fixtures';

const config: Config = {
  botToken: '', botName: 'test_bot', sessionSecret: 'test', clientUrl: 'http://localhost',
  dbPath: ':memory:', contentPath: '', port: 0, allowDevAuth: true, botPolling: false,
};

// Большие вымышленные id: их не должно быть в выгрузке ни в каком виде.
const GM_ID = 777100;
const PLAYER_IDS = [777001, 777002, 777003, 777004];

/** Часы с небольшими числами, чтобы вымышленные id не совпали с отметками времени; коды из UUID. */
function opts(): GameOpts & { clock: { now: number } } {
  const clock = { now: 1_000_000 };
  return { clock, now: () => clock.now, newId: () => randomUUID(), random: () => 0.5 };
}

async function must(game: Game, cmd: Command): Promise<void> {
  const r = await game.submit(nextCmd(), cmd, gm);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
}

/** Все коды, которые когда-либо были в журнале: приглашения, ведущего, перевыпущенные. */
function allCodes(store: EventStore): string[] {
  const codes: string[] = [];
  for (const e of store.all()) {
    if (e.type === 'SessionCreated' || e.type === 'SessionReset') codes.push(...Object.values(e.codes));
    if (e.type === 'InviteRebound') codes.push(e.code);
  }
  return codes;
}

function expectClean(text: string, codes: string[]): void {
  for (const id of [GM_ID, ...PLAYER_IDS]) expect(text, `id ${id}`).not.toContain(String(id));
  expect(codes.length).toBeGreaterThan(0);
  for (const code of codes) expect(text, `код ${code}`).not.toContain(code);
  expect(text).not.toContain('telegramId');
  expect(text).not.toContain('gmTelegramId');
}

let o = opts();
let store: EventStore;
let game: Game;
let app: FastifyInstance;
let base: string;

async function devAuth(userId: number, startParam?: string): Promise<string> {
  const res = await fetch(`${base}/api/auth`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dev: startParam === undefined ? { userId } : { userId, startParam } }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

let gmToken: string;
let playerToken: string;

// Сервер пишет в консоль о сбросе и игре «за игрока»; в тесте это шум.
const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeAll(async () => {
  o = opts();
  store = new EventStore(':memory:');
  game = Game.open(store, content, o);
  app = buildApp({ game, store, content, config, now: o.now });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  gmToken = await devAuth(GM_ID, game.gmCode());
  await must(game, { type: 'session.setN', n: 12 });
  const [k1, k2, k3] = game.state().roster;
  playerToken = await devAuth(PLAYER_IDS[0], game.state().invites[k1]);
  await devAuth(PLAYER_IDS[1], game.state().invites[k2]);
  await devAuth(PLAYER_IDS[2], game.state().invites[k3]);
  // Ведущий перевыпускает ссылку первой роли, и её занимает другой аккаунт.
  await must(game, { type: 'gm.rebind', roleKey: k1 });
  await devAuth(PLAYER_IDS[3], game.state().invites[k1]);
  expect(game.state().players[k1].telegramId).toBe(PLAYER_IDS[3]);
  for (const roleKey of game.state().roster) await must(game, { type: 'player.setPresent', roleKey, present: true });
  await must(game, { type: 'session.open' });
});

afterAll(async () => {
  await app.close();
  store.close();
  quiet.mockRestore();
});

const exportUrl = (query = '') => `${base}/api/gm/export${query}`;

test('выгрузка: без токена 401, с неверным 401, игроку 403, ведущему «за игрока» 403', async () => {
  expect((await fetch(exportUrl())).status).toBe(401);
  expect((await fetch(exportUrl('?token=abc.def'))).status).toBe(401);
  expect((await fetch(exportUrl(), { headers: { authorization: 'Bearer abc.def' } })).status).toBe(401);
  expect((await fetch(exportUrl(), { headers: { authorization: `Bearer ${playerToken}` } })).status).toBe(403);
  expect((await fetch(exportUrl(`?token=${encodeURIComponent(playerToken)}`))).status).toBe(403);

  const asRes = await fetch(`${base}/api/gm/as`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: gmToken, roleKey: game.state().roster[1] }),
  });
  const asToken = ((await asRes.json()) as { token: string }).token;
  expect((await fetch(exportUrl(), { headers: { authorization: `Bearer ${asToken}` } })).status).toBe(403);
  expect((await fetch(exportUrl(`?token=${encodeURIComponent(asToken)}`))).status).toBe(403);
});

test('выгрузка ведущему: 200, вложение с датой, журнал целиком и без личных данных', async () => {
  const date = new Date(o.now()).toISOString().slice(0, 10);
  for (const res of [
    await fetch(exportUrl(), { headers: { authorization: `Bearer ${gmToken}` } }),
    await fetch(exportUrl(`?token=${encodeURIComponent(gmToken)}`)),
  ]) {
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="evening-${date}.json"`);
    const text = await res.text();
    const body = JSON.parse(text) as Export;
    expect(body.contentVersion).toBe(content.version);
    expect(body.exportedAt).toBe(o.now());
    expect(body.events.length).toBe(store.all().length);
    expect(body.state.seq).toBe(game.state().seq);
    expect(Object.keys(body.state.players)).toEqual(Object.keys(game.state().players));
    expectClean(text, [...allCodes(store), game.gmCode()]);
  }
});

test('stripPersonal не меняет входы, а после сброса чистит SessionReset', async () => {
  const st = new EventStore(':memory:');
  const go = opts();
  const g = Game.open(st, content, go);
  await g.bindByCode(g.gmCode(), GM_ID);
  await must(g, { type: 'session.setN', n: 12 });
  const k = g.state().roster[0];
  await g.bindByCode(g.state().invites[k], PLAYER_IDS[0]);
  await must(g, { type: 'session.reset' });
  expect(g.state().gmTelegramId).toBe(GM_ID);

  const events = st.all();
  const state = g.state();
  const before = JSON.stringify({ events, state });
  const stripped = stripPersonal(events, state);
  expect(JSON.stringify({ events, state })).toBe(before);
  expectClean(JSON.stringify(stripped), [...allCodes(st), g.gmCode()]);

  const exp = buildExport(st, g, content, () => 42);
  expect(exp).toMatchObject({ exportedAt: 42, contentVersion: content.version });
  expect(exp.events.length).toBe(events.length);
  expectClean(JSON.stringify(exp), [...allCodes(st), g.gmCode()]);
  st.close();
});

test('имя файла автозаписи', () => {
  expect(exportFileName(1234)).toBe('evening-1234.json');
});

// Автозапись: база во временной папке, игра доводится до закрытия.
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function closableGame(dir: string) {
  const st = new EventStore(join(dir, 'fair.db'));
  const go = opts();
  const g = Game.open(st, content, go);
  await must(g, { type: 'session.setN', n: 12 });
  for (const roleKey of g.state().roster) await must(g, { type: 'player.setPresent', roleKey, present: true });
  await must(g, { type: 'session.open' });
  await must(g, { type: 'act.next' });
  await must(g, { type: 'act.next' });
  expect(g.state().phase).toBe('act3');
  return { st, g, go };
}

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'fair-export-'));
  dirs.push(d);
  return d;
}

test('автозапись: файл при закрытии, перезапись на исправлении и показе', async () => {
  const dir = tempDir();
  const { st, g, go } = await closableGame(dir);
  const exportsDir = join(dir, 'exports');
  const log = vi.fn();
  const stop = writeExportOnClose(g, st, content, exportsDir, log);
  await must(g, { type: 'gm.announce', text: 'до закрытия' });
  expect(existsSync(exportsDir)).toBe(false);

  go.clock.now += 1000;
  await must(g, { type: 'session.close' });
  const closedAt = g.state().closing!.closedAt;
  const file = join(exportsDir, exportFileName(closedAt));
  expect(readdirSync(exportsDir)).toEqual([exportFileName(closedAt)]);
  const first = JSON.parse(readFileSync(file, 'utf8')) as Export;
  expect(first.state.phase).toBe('closed');
  expect(first.events.length).toBe(st.all().length);

  const key = g.state().roster[0];
  await must(g, { type: 'gm.correct', playerKey: key, change: { field: 'goal', index: 0, value: true }, reason: 'у стола' });
  const second = JSON.parse(readFileSync(file, 'utf8')) as Export;
  expect(second.events.length).toBe(first.events.length + 1);
  expect(second.events.at(-1)?.type).toBe('Corrected');
  expect(second.state.closing!.players[key].goals[0]).toBe(true);

  await must(g, { type: 'session.reveal' });
  const third = JSON.parse(readFileSync(file, 'utf8')) as Export;
  expect(third.state.phase).toBe('revealed');
  expect(readdirSync(exportsDir)).toEqual([exportFileName(closedAt)]);
  expect(log).not.toHaveBeenCalled();

  stop();
  await must(g, { type: 'gm.correct', playerKey: key, change: { field: 'goal', index: 0, value: false }, reason: 'после отписки' });
  expect((JSON.parse(readFileSync(file, 'utf8')) as Export).events.length).toBe(third.events.length);
  st.close();
});

test('автозапись: без папки (база в памяти) файл не пишется', async () => {
  const dir = tempDir();
  const { st, g } = await closableGame(dir);
  const log = vi.fn();
  writeExportOnClose(g, st, content, null, log);
  await must(g, { type: 'session.close' });
  expect(readdirSync(dir).filter(f => !f.startsWith('fair.db'))).toEqual([]);
  expect(log).not.toHaveBeenCalled();
  st.close();
});

test('автозапись: недоступная папка не мешает закрытию, ошибка уходит в log', async () => {
  const dir = tempDir();
  const { st, g } = await closableGame(dir);
  const blocked = join(dir, 'exports');
  writeFileSync(blocked, 'файл вместо папки');
  const log = vi.fn();
  writeExportOnClose(g, st, content, blocked, log);
  const r = await g.submit(nextCmd(), { type: 'session.close' }, gm);
  expect(r.ok).toBe(true);
  expect(g.state().phase).toBe('closed');
  expect(log).toHaveBeenCalledTimes(1);
  expect(String(log.mock.calls[0][0])).toContain('выгруз');
  st.close();
});
