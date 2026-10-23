import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Command } from '@fair/shared';
import { EventStore } from '../store';
import { Game } from '../game';
import { content, empty, gm, memoryGame, openFair, testOpts } from './fixtures';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

test('пустой журнал: SessionCreated с кодами для 30 ролей и ведущего, gmCode в meta', () => {
  const { store, game } = memoryGame();
  const events = store.all();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'SessionCreated', seq: 1 });
  const codes = (events[0] as unknown as { codes: Record<string, string> }).codes;
  expect(Object.keys(codes)).toHaveLength(content.roles.length + 1);
  for (const code of Object.values(codes)) expect(code).toMatch(/^[A-Za-z0-9]{12}$/);
  expect(new Set(Object.values(codes)).size).toBe(Object.values(codes).length);
  expect(game.gmCode()).toBe(codes.gm);
  expect(store.getMeta('gmCode')).toBe(codes.gm);
  expect(game.state().seq).toBe(1);
});

test('submit с тем же cmdId второй раз: тот же результат, число событий не выросло', async () => {
  const { store, game } = memoryGame();
  const cmd: Command = { type: 'session.setN', n: 12 };
  const r1 = await game.submit('c1', cmd, gm);
  expect(r1).toEqual({ ok: true, seq: store.all().length });
  const count = store.all().length;
  const stateBefore = game.state();

  const r2 = await game.submit('c1', cmd, gm);
  expect(r2).toEqual(r1);
  expect(store.all()).toHaveLength(count);
  expect(game.state()).toBe(stateBefore);

  // Неудачный результат тоже запоминается и повторяется.
  const bad1 = await game.submit('c2', { type: 'session.setN', n: 12 }, { type: 'player', roleKey: 'x' });
  expect(bad1.ok).toBe(false);
  expect(await game.submit('c2', cmd, gm)).toEqual(bad1);
  expect(store.all()).toHaveLength(count);
});

test('два submit одновременно на одну вещь: ровно один ok', async () => {
  const { store, game } = memoryGame();
  await openFair(game);
  const s = game.state();
  const [from, to] = s.roster;
  const itemId = Object.keys(s.items).find(id => {
    const it = s.items[id];
    return it.owner.type === 'player' && it.owner.key === from && it.hiddenUntilAct === undefined;
  });
  expect(itemId).toBeDefined();
  const before = store.all().length;
  const offer: Command = { type: 'offer.create', to, give: { ...empty(), items: [itemId!] }, get: empty() };
  const actor = { type: 'player' as const, roleKey: from };

  const results = await Promise.all([game.submit('race-a', offer, actor), game.submit('race-b', offer, actor)]);
  expect(results.filter(r => r.ok)).toHaveLength(1);
  const failed = results.find(r => !r.ok);
  expect(failed).toEqual({ ok: false, error: 'reserved' });
  const created = store.all().slice(before);
  expect(created.map(e => e.type)).toEqual(['OfferCreated']);
  expect(Object.values(game.state().offers)).toHaveLength(1);
});

test('перезапуск: Game.open на том же store → state toEqual прежнему', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fair-game-'));
  dirs.push(dir);
  const path = join(dir, 'session.sqlite');
  const opts = testOpts();
  const store = new EventStore(path);
  const game = Game.open(store, content, opts);
  await openFair(game);
  const s0 = game.state();
  const r = await game.submit('o1', { type: 'offer.create', to: s0.roster[1], give: { ...empty(), gold: 1 }, get: empty() },
    { type: 'player', roleKey: s0.roster[0] });
  expect(r.ok).toBe(true);
  await game.bindByCode(s0.invites[s0.roster[2]], 777);
  const before = game.state();
  store.close();

  const reopenedStore = new EventStore(path);
  const restarted = Game.open(reopenedStore, content, testOpts());
  expect(restarted.state()).toEqual(before);
  expect(restarted.state().seq).toBe(reopenedStore.all().length);
  expect(restarted.gmCode()).toBe(game.gmCode());
  expect(reopenedStore.all().filter(e => e.type === 'SessionCreated')).toHaveLength(1);
  reopenedStore.close();
});

test('tick при now ≥ expiresAt закрывает предложение как expired', async () => {
  const { game, opts, store } = memoryGame();
  await openFair(game);
  const s = game.state();
  const r = await game.submit('o1', { type: 'offer.create', to: s.roster[1], give: { ...empty(), gold: 1 }, get: empty() },
    { type: 'player', roleKey: s.roster[0] });
  expect(r.ok).toBe(true);
  const [offer] = Object.values(game.state().offers);
  expect(offer.status).toBe('pending');
  expect(offer.expiresAt).toBe(opts.clock.now + 300000);

  const states: string[] = [];
  game.subscribe(st => states.push(st.offers[offer.id].status));

  opts.clock.now = offer.expiresAt - 1;
  game.tick();
  await game.submit('flush-1', { type: 'session.setN', n: 12 }, gm); // дождаться очереди
  expect(game.state().offers[offer.id].status).toBe('pending');

  opts.clock.now = offer.expiresAt;
  game.tick();
  await game.submit('flush-2', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().offers[offer.id].status).toBe('expired');
  expect(store.getResult('expire:' + offer.id)).toMatchObject({ ok: true });
  expect(states).toContain('expired');
});

test('bindByCode кодом ведущего → {type:"gm"}, кодом роли → {type:"player"}, неизвестным → undefined', async () => {
  const { game } = memoryGame();
  await game.submit('n', { type: 'session.setN', n: 12 }, gm);
  const roleKey = game.state().roster[0];
  const code = game.state().invites[roleKey];

  expect(await game.bindByCode(game.gmCode(), 1)).toEqual({ type: 'gm' });
  expect(game.actorFor(1)).toEqual({ type: 'gm' });
  expect(await game.bindByCode(code, 2)).toEqual({ type: 'player', roleKey });
  expect(game.actorFor(2)).toEqual({ type: 'player', roleKey });
  expect(await game.bindByCode('НЕИЗВЕСТНЫЙ', 3)).toBeUndefined();
  expect(game.actorFor(3)).toBeUndefined();
  // Чужой аккаунт на занятом коде не получает роль.
  expect(await game.bindByCode(code, 4)).toBeUndefined();
  // Повторный вход тем же аккаунтом снова даёт ту же роль.
  expect(await game.bindByCode(code, 2)).toEqual({ type: 'player', roleKey });
});

test('subscribe: подписчик получает новое состояние, отписка работает', async () => {
  const { game } = memoryGame();
  const seen: number[] = [];
  const off = game.subscribe(s => seen.push(s.seq));
  await game.submit('a', { type: 'session.setN', n: 12 }, gm);
  off();
  await game.submit('b', { type: 'session.setN', n: 13 }, gm);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toBeGreaterThan(1);
});
