import { afterEach, expect, test } from 'vitest';
import { Game } from '../game';
import { EventStore } from '../store';
import { attachHiddenScenario } from '../scenario';
import { content, gm, openFair, testOpts } from './fixtures';
const stores: EventStore[] = [];
function db() { const store = new EventStore(':memory:'); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

test.each([true, false])('сброс старой партии использует настройку новых правил сервера: %s', async hidden17 => {
  const store = db(); const c = attachHiddenScenario(content, undefined, false);
  const old = Game.open(store, content, testOpts());
  await old.bindByCode(old.gmCode(), 12345);
  await openFair(old);
  const opts = { ...testOpts(), hidden17 };
  const game = Game.open(store, c, opts);
  expect(game.state().hidden17).toBeUndefined();
  const result = await game.submit('reset', { type: 'session.reset' }, gm);
  expect(result.ok).toBe(true);
  expect(game.state().phase).toBe('setup');
  expect(game.state().gmTelegramId).toBe(12345);
  if (hidden17) {
    expect(game.state().hidden17?.ritual.step).toBe('preparation');
    expect(game.state().roster).toHaveLength(17);
    expect(game.state().altars).toEqual({});
  } else {
    expect(game.state().hidden17).toBeUndefined();
  }
  const resetState = game.state();
  expect(await game.submit('reset', { type: 'session.reset' }, gm)).toEqual(result);
  expect(game.state()).toEqual(resetState);
  expect(Game.open(store, c, opts).state()).toEqual(resetState);
});

test('новая партия включает 17 ролей атомарным воспроизводимым событием; старый журнал не переводится', () => {
  const c = attachHiddenScenario(content, undefined, false);
  const fresh = db(); const game = Game.open(fresh, c, { ...testOpts(), hidden17: true });
  expect(game.state().roster).toHaveLength(17);
  expect(game.state().hidden17?.ritual.step).toBe('preparation');
  expect(Game.open(fresh, c, { ...testOpts(), hidden17: true }).state()).toEqual(game.state());
  const legacy = db(); const old = Game.open(legacy, content, testOpts());
  expect(Game.open(legacy, c, { ...testOpts(), hidden17: true }).state()).toEqual(old.state());
  expect(old.state().hidden17).toBeUndefined();
});

test('сервер истекает заказ, возвращает резерв и сохраняет результат при повторном открытии', async () => {
  const c = attachHiddenScenario(content, undefined, false); const store = db(); const opts = { ...testOpts(), hidden17: true };
  const game = Game.open(store, c, opts);
  for (const roleKey of game.state().roster) expect((await game.submit(`present-${roleKey}`, { type: 'player.setPresent', roleKey, present: true }, gm)).ok).toBe(true);
  expect((await game.submit('open', { type: 'session.open' }, gm)).ok).toBe(true);
  const before = game.state().players.o1.gold;
  expect((await game.submit('board', { type: 'hidden17.board.create', title: 'Доставка', condition: 'Принести письмо', verification: 'Ведущий', reward: { gold: 1, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] }, expiresAt: opts.clock.now + 1000 }, { type: 'player', roleKey: 'o1' })).ok).toBe(true);
  expect(game.state().players.o1.reservedGold).toBe(1);
  opts.clock.now += 1001; game.tick();
  await game.submit('flush', { type: 'gm.announce', text: 'Проверка' }, gm);
  expect(Object.values(game.state().hidden17!.board)[0].status).toBe('expired');
  expect(game.state().players.o1.reservedGold).toBe(0);
  expect(game.state().players.o1.gold).toBe(before);
  expect(Game.open(store, c, opts).state()).toEqual(game.state());
});
