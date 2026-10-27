import { expect, test } from 'vitest';
import { ABILITY_BY_ROLE } from '../abilities';
import type { AbilityUse, Actor, Command } from '../commands';
import { reduce } from '../engine';
import type { Event } from '../events';
import type { GameState } from '../types';
import { checkActStart, checkGold, checkInvariants, content, gm, makeGame, newGame, player, run } from './helpers';

/**
 * Сценарий акта I на 30 игроков: каждая роль применяет способность, цели подобраны так,
 * чтобы почти всё прошло; одна враждебная попытка отражается защитой. После каждой команды —
 * инварианты §6.8; в конце журнал событий, проигранный с нуля, даёт то же состояние (пункт 13).
 */
test('акт I: все 30 способностей, инварианты после каждой команды, replay журнала, смена акта', () => {
  const log: Event[] = [];
  let s = makeGame(30, { log });
  expect(s.roster).toHaveLength(30);
  checkInvariants(s);
  let now = 1000;

  const step = (cmd: Command, actor: Actor): Event[] => {
    now += 1000;
    const r = run(s, cmd, actor, now);
    if (!r.ok) throw new Error(`${cmd.type} от ${actor.type === 'player' ? actor.roleKey : actor.type}: ${r.error} ${r.detail ?? ''}`);
    s = r.state;
    log.push(...r.events);
    checkInvariants(s);
    checkGold(log, s);
    return r.events;
  };
  const used = new Set<string>();
  /** Способность; при запросе согласия одобряющие сразу соглашаются. */
  const ability = (key: string, use: AbilityUse) => {
    const events = step({ type: 'ability.use', use }, player(key));
    const requested = events.find(e => e.type === 'ConsentRequested');
    if (requested?.type === 'ConsentRequested') {
      for (const by of requested.request.approvers) step({ type: 'consent.accept', id: requested.request.id }, player(by));
      expect(s.requests[requested.request.id].status).toBe('accepted');
    }
    expect(s.players[key].abilityUsedInAct).toBe(true);
    used.add(key);
  };
  const craft = (key: string, recipeId: string) => {
    step({ type: 'shop.craft', recipeId }, player(key));
    const mine = Object.values(s.items).filter(i => i.owner.type === 'player' && i.owner.key === key && i.ref === recipeId);
    return mine[mine.length - 1].id;
  };

  // Защиты ставятся раньше враждебных попыток и переноса.
  ability('o4', { kind: 'protectSelf' });
  ability('o9', { kind: 'protectOther', target: 'r3' });
  ability('t3', { kind: 'protectOther', target: 'o11' });
  ability('o16', { kind: 'transferProtection', from: 'o11', to: 't2' });
  expect(s.players.t2.protection).toEqual({ by: 't3', source: 'ability' });

  // Мастерская.
  ability('o1', { kind: 'payAshWithGold', recipeId: 'focus' });
  ability('o2', { kind: 'grow', give: 'moon' });
  step({ type: 'shop.buy', ingredient: 'ash' }, player('o5'));
  ability('o5', { kind: 'focusFree' });
  ability('o6', { kind: 'substituteIngredient', recipeId: 'cleanse', from: 'ash', to: 'dew' });
  ability('o7', { kind: 'buyBulk', take: ['dew', 'dew'] });
  ability('o3', { kind: 'buyCheap', ingredient: 'moon' });
  ability('r3', { kind: 'buyCheap', ingredient: 'ash' });
  ability('n18', { kind: 'swapIngredient', give: 'ash', take: 'moon' });
  ability('n19', { kind: 'buyFromBank', ingredient: 'dew' });
  ability('o13', { kind: 'disassemble', itemId: craft('o13', 'focus'), take: ['ash', 'dew'] });
  ability('n20', { kind: 'reforge', itemId: craft('n20', 'ward'), into: 'focus' });
  ability('t1', { kind: 'sellToBank', itemId: craft('t1', 'cleanse') });
  ability('o17', { kind: 'copyAbility', copy: { kind: 'grow', give: 'ash' } });

  // Враждебные: четыре разные цели, попытка Долфа по защищённому Туману отражена.
  ability('o8', { kind: 'stealGold', target: 'o2' });
  ability('o12', { kind: 'thorns', target: 'n19' });
  ability('t4', { kind: 'stealIngredient', target: 'o5', ingredient: 'moon' });
  ability('r4', { kind: 'stealGold', target: 'o4' });
  expect(s.actions.at(-1)).toMatchObject({ author: 'r4', outcome: 'blocked', hostile: true });
  expect(s.players.o4).not.toHaveProperty('protection');

  // Согласия: очищение, скидки, снятие шипов.
  ability('o10', { kind: 'cleanseOther', target: 'o9' });
  expect(s.players.o9.curse).toBe(false);
  ability('o14', { kind: 'discountOther', target: 'r2' });
  ability('r1', { kind: 'discountOther', target: 'r1' });
  ability('r6', { kind: 'cleanseOther', target: 'n19' });
  expect(s.players.n19.thorns).toBe(false);

  // Наблюдения.
  ability('o11', { kind: 'inspectInventory', target: 'o14' });
  ability('o15', { kind: 'sniffIngredient', ingredient: 'ash' });
  ability('r2', { kind: 'askSide', target: 'o8' });
  ability('t2', { kind: 'knowGold', target: 'o1' });
  ability('r5', { kind: 'askYesNo', target: 'o10', question: 'Ты ищешь корону?' });

  // Вещь: Камень облика на себя.
  step({ type: 'item.use', itemId: craft('r5', 'shape'), guise: 'Странник' }, player('r5'));

  expect([...used].sort()).toEqual(s.roster.slice().sort());
  expect(new Set(s.actions.filter(a => a.source.type === 'ability').map(a => a.source.type === 'ability' && a.source.ability)))
    .toEqual(new Set(s.roster.map(k => ABILITY_BY_ROLE[k])));
  expect(s.actions.filter(a => a.outcome === 'blocked')).toHaveLength(1);
  expect(Object.values(s.requests).every(r => r.status === 'accepted')).toBe(true);

  // 13. Журнал с нуля даёт то же состояние.
  const replayed = log.reduce((st: GameState, e) => reduce(st, content, e), newGame());
  expect(replayed).toEqual(s);

  // 10. Смена акта: применения возвращены, отметки акта сняты, облик сохранён.
  const before = s;
  step({ type: 'act.next' }, gm);
  checkActStart(before, s);
  expect(s.players.r5.guise?.name).toBe('Странник');
  expect(log.reduce((st: GameState, e) => reduce(st, content, e), newGame())).toEqual(s);
});

test('checkInvariants ловит нарушения §6.8', () => {
  const s = makeGame(12, { present: ['o1', 'o2', 'o4', 'o5', 'o6', 'o8', 'o9', 'o10', 'o11', 'o14', 'o16'] });
  checkInvariants(s);
  const patch = (key: string, p: Partial<GameState['players'][string]>): GameState =>
    ({ ...s, players: { ...s.players, [key]: { ...s.players[key], ...p } } });
  expect(() => checkInvariants(patch('o13', { protection: { by: 'gm', source: 'gm' } }))).toThrow('защита у отсутствующего');
  expect(() => checkInvariants(patch('o1', { abilityUsedInAct: true }))).toThrow('abilityUsedInAct');
  expect(() => checkInvariants(patch('o1', { hostileAttemptsAgainstInAct: 2 }))).toThrow('попыток');
  expect(() => checkInvariants(patch('o1', { gold: 1, reservedGold: 2 }))).toThrow('резерва');
  expect(() => checkInvariants({ ...s, workshop: { ...s.workshop, ash: -1 } })).toThrow('мастерской');
  expect(() => checkInvariants(patch('o1', { abilityPending: 'нет' }))).toThrow('abilityPending');

  const r = run(s, { type: 'ability.use', use: { kind: 'inspectInventory', target: 'o14' } }, player('o11'));
  if (!r.ok) throw new Error(r.error);
  checkInvariants(r.state);
  const rec = r.state.actions[0];
  const leaked = { ...rec, intel: { kind: 'inventory' as const, target: 'o14', gold: 6, reservedGold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [{ kind: 'shard' as const, ref: 'V' }] } };
  expect(() => checkInvariants({ ...r.state, actions: [leaked] })).toThrow('осколок V');
  const item = Object.values(s.items)[0];
  expect(() => checkInvariants({ ...r.state, actions: [{ ...rec, effects: [{ type: 'itemRemoved', itemId: item.id }] }] })).toThrow('осталась');
  expect(() => checkInvariants({ ...r.state, actions: [{ ...rec, outcome: 'blocked' }] })).toThrow('отражённая');
  expect(() => checkInvariants({ ...r.state, actions: [rec, { ...rec, id: 'x' }] })).toThrow('записей способности');
});
