import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { defaultRoster, type Command } from '@fair/shared';
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
  // Результат и события сохранены вместе.
  expect(store.getResult('c1')).toEqual(r1);
  const count = store.all().length;
  const stateBefore = game.state();

  const r2 = await game.submit('c1', cmd, gm);
  expect(r2).toEqual(r1);
  expect(store.all()).toHaveLength(count);
  expect(game.state()).toBe(stateBefore);
});

test('неудачный результат не сохраняется: повтор того же cmdId выполняется заново и может пройти', async () => {
  const { store, game } = memoryGame();
  const cmd: Command = { type: 'session.setN', n: 12 };
  const bad = await game.submit('c2', cmd, { type: 'player', roleKey: 'x' });
  expect(bad).toEqual({ ok: false, error: 'forbidden' });
  expect(store.getResult('c2')).toBeUndefined();
  const count = store.all().length;

  const good = await game.submit('c2', cmd, gm);
  expect(good.ok).toBe(true);
  expect(store.all().length).toBeGreaterThan(count);
  expect(store.getResult('c2')).toEqual(good);
});

test('bindByCode роли вне состава → undefined; после включения роли тот же код и аккаунт → игрок', async () => {
  const { game } = memoryGame();
  await game.submit('n', { type: 'session.setN', n: 12 }, gm);
  const outside = content.roles.map(r => r.key).find(k => !game.state().roster.includes(k))!;
  expect(outside).toBeDefined();
  const code = game.state().invites[outside];

  expect(await game.bindByCode(code, 55)).toBeUndefined();
  const t = await game.submit('toggle', { type: 'session.toggleRole', roleKey: outside }, gm);
  expect(t.ok).toBe(true);
  expect(await game.bindByCode(code, 55)).toEqual({ type: 'player', roleKey: outside });
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

test('привязка переживает смену состава: bind → setN вниз → setN вверх → bind снова даёт игрока', async () => {
  const { game } = memoryGame();
  await game.submit('n20', { type: 'session.setN', n: 20 }, gm);
  const in12 = new Set(defaultRoster(content, 12));
  const roleKey = game.state().roster.find(k => !in12.has(k))!;
  const code = game.state().invites[roleKey];
  expect(await game.bindByCode(code, 77)).toEqual({ type: 'player', roleKey });

  await game.submit('n12', { type: 'session.setN', n: 12 }, gm);
  expect(game.actorFor(77)).toBeUndefined();
  await game.submit('n20-again', { type: 'session.setN', n: 20 }, gm);
  expect(game.actorFor(77)).toEqual({ type: 'player', roleKey });
  expect(await game.bindByCode(code, 77)).toEqual({ type: 'player', roleKey });
});

test('повторное открытие той же ссылки после смены роли не упирается в сохранённый результат прошлой привязки', async () => {
  const { game } = memoryGame();
  await game.submit('n', { type: 'session.setN', n: 12 }, gm);
  const [a, b] = game.state().roster;
  const codeA = game.state().invites[a];
  const codeB = game.state().invites[b];
  expect(await game.bindByCode(codeA, 5)).toEqual({ type: 'player', roleKey: a });
  // Роль A убрали, гость занял B; потом вернули A и убрали B — гость снова открывает ссылку A.
  await game.submit('offA', { type: 'session.toggleRole', roleKey: a }, gm);
  expect(await game.bindByCode(codeB, 5)).toEqual({ type: 'player', roleKey: b });
  await game.submit('onA', { type: 'session.toggleRole', roleKey: a }, gm);
  await game.submit('offB', { type: 'session.toggleRole', roleKey: b }, gm);
  expect(game.actorFor(5)).toBeUndefined();
  expect(await game.bindByCode(codeA, 5)).toEqual({ type: 'player', roleKey: a });
});

test('ведущий открывает ссылку роли: роль остаётся свободной, гость привязывается', async () => {
  const { game } = memoryGame();
  await game.submit('n', { type: 'session.setN', n: 12 }, gm);
  const roleKey = game.state().roster[0];
  const code = game.state().invites[roleKey];
  expect(await game.bindByCode(game.gmCode(), 1)).toEqual({ type: 'gm' });
  expect(await game.bindByCode(code, 1)).toEqual({ type: 'gm' });
  expect(game.state().players[roleKey].telegramId).toBeUndefined();
  expect(await game.bindByCode(code, 2)).toEqual({ type: 'player', roleKey });
});

test('пауза останавливает истечение: +6 минут на паузе, tick → pending; resume → срок сдвинут', async () => {
  const { game, opts } = memoryGame();
  await openFair(game);
  const s = game.state();
  await game.submit('o1', { type: 'offer.create', to: s.roster[1], give: { ...empty(), gold: 1 }, get: empty() },
    { type: 'player', roleKey: s.roster[0] });
  const [offer] = Object.values(game.state().offers);

  opts.clock.now += 1000;
  expect((await game.submit('pause', { type: 'clock.pause' }, gm)).ok).toBe(true);
  opts.clock.now += 6 * 60_000;
  game.tick();
  await game.submit('flush-p', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().offers[offer.id].status).toBe('pending');

  expect((await game.submit('resume', { type: 'clock.resume' }, gm)).ok).toBe(true);
  expect(game.state().offers[offer.id].expiresAt).toBe(offer.expiresAt + 6 * 60_000);
  game.tick();
  await game.submit('flush-r', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().offers[offer.id].status).toBe('pending');
});

test('tick закрывает просроченный запрос согласия как expired; на паузе нет; повтор не дублирует', async () => {
  const { game, opts, store } = memoryGame();
  await openFair(game);
  const o10 = { type: 'player' as const, roleKey: 'o10' };
  const r = await game.submit('cleanse', { type: 'ability.use', use: { kind: 'cleanseOther', target: 'o9' } }, o10);
  expect(r.ok).toBe(true);
  const [req] = Object.values(game.state().requests);
  expect(req.status).toBe('pending');
  expect(game.state().players.o10.abilityPending).toBe(req.id);

  opts.clock.now = req.expiresAt - 1;
  game.tick();
  await game.submit('flush-1', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().requests[req.id].status).toBe('pending');

  // На паузе срок стоит, даже если часы ушли далеко вперёд.
  expect((await game.submit('pause', { type: 'clock.pause' }, gm)).ok).toBe(true);
  opts.clock.now = req.expiresAt + 60_000;
  game.tick();
  await game.submit('flush-2', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().requests[req.id].status).toBe('pending');
  expect((await game.submit('resume', { type: 'clock.resume' }, gm)).ok).toBe(true);
  const shifted = game.state().requests[req.id].expiresAt;
  expect(shifted).toBeGreaterThan(req.expiresAt);

  opts.clock.now = shifted;
  game.tick();
  game.tick();
  await game.submit('flush-3', { type: 'session.setN', n: 12 }, gm);
  expect(game.state().requests[req.id]).toMatchObject({ status: 'expired', reason: 'timeout' });
  expect(game.state().players.o10.abilityPending).toBeUndefined();
  expect(game.state().players.o10.abilityUsedInAct).toBe(false);
  expect(store.getResult('expire:consent:' + req.id)).toMatchObject({ ok: true });
  expect(store.all().filter(e => e.type === 'ConsentClosed')).toHaveLength(1);
});

test('повтор cmdId для ability.use не применяет способность второй раз', async () => {
  const { game, store } = memoryGame();
  await openFair(game);
  const o8 = { type: 'player' as const, roleKey: 'o8' };
  const cmd: Command = { type: 'ability.use', use: { kind: 'stealGold', target: 'o2' } };
  const before = { o8: game.state().players.o8.gold, o2: game.state().players.o2.gold };
  const r1 = await game.submit('steal-1', cmd, o8);
  expect(r1.ok).toBe(true);
  const count = store.all().length;
  const r2 = await game.submit('steal-1', cmd, o8);
  expect(r2).toEqual(r1);
  expect(store.all()).toHaveLength(count);
  expect(game.state().players.o8.gold).toBe(before.o8 + 1);
  expect(game.state().players.o2.gold).toBe(before.o2 - 1);
  expect(game.state().actions).toHaveLength(1);
});
