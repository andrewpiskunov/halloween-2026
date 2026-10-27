import { describe, expect, test } from 'vitest';
import { checkInvariants, gm, makeGame, player, run } from './helpers';
import type { Bundle, Counts, GameState, Item, Player } from '../types';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });
const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});

/** Изготавливает вещь в мастерской и возвращает состояние и вещь. */
function craft(s: GameState, key: string, recipeId: string): { state: GameState; item: Item } {
  const r = run(s, { type: 'shop.craft', recipeId }, player(key));
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  const e = r.events.find(x => x.type === 'ItemCrafted');
  if (e?.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
  return { state: r.state, item: e.item };
}

const useItem = (s: GameState, key: string, itemId: string, target?: string) =>
  run(s, { type: 'item.use', itemId, ...(target !== undefined ? { target } : {}) }, player(key));
const errorOf = (r: ReturnType<typeof useItem>) => (r.ok ? 'ok' : r.error);

describe('item.use: Защитный талисман', () => {
  test('талисман исчезает и даёт защиту автору; запись журнала от вещи', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(item.kind).toBe('ward');
    const r = useItem(s, 'o2', item.id);
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
    expect(r.events).toEqual([{
      type: 'ItemUsed', at: 0, player: 'o2', itemId: item.id, kind: 'ward', target: 'o2',
      effects: [{ type: 'itemRemoved', itemId: item.id }, { type: 'protection', player: 'o2', value: { by: 'o2', source: 'ward' } }],
    }]);
    expect(r.state.items[item.id]).toBeUndefined();
    expect(r.state.players.o2.protection).toEqual({ by: 'o2', source: 'ward' });
    // Вещь не расходует применение способности.
    expect(r.state.players.o2.abilityUsedInAct).toBe(false);
    expect(r.state.actions).toEqual([expect.objectContaining({
      author: 'o2', act: 1, source: { type: 'item', kind: 'ward' }, target: 'o2', outcome: 'done', hostile: false,
    })]);
    // target, равный автору, допустим.
    expect(errorOf(useItem(s, 'o2', item.id, 'o2'))).toBe('ok');
  });

  test('при активной защите → limit «защита уже есть»; другая цель → invalid', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    const prot = withPlayer(s, 'o2', { protection: { by: 'o9', source: 'ability' } });
    const r = useItem(prot, 'o2', item.id);
    expect(errorOf(r)).toBe('limit');
    expect(r.ok ? '' : r.detail).toBe('защита уже есть');
    expect(errorOf(useItem(s, 'o2', item.id, 'o6'))).toBe('invalid');
  });
});

describe('item.use: общие проверки', () => {
  test('Фокус и реликвия → invalid «эту вещь не применяют»', () => {
    const { state: s, item } = craft(makeGame(30), 'o4', 'focus');
    expect(item.kind).toBe('focus');
    const r = useItem(s, 'o4', item.id);
    expect(errorOf(r)).toBe('invalid');
    expect(r.ok ? '' : r.detail).toBe('эту вещь не применяют');
    const relic = Object.values(s.items).find(i => i.kind === 'relic' && i.owner.type === 'player' && i.owner.key === 'o2')!;
    expect(errorOf(useItem(s, 'o2', relic.id))).toBe('invalid');
  });

  test('чужая вещь → not_owner; нет вещи → not_found; вещь в резерве сделки → reserved', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(errorOf(useItem(s, 'o4', item.id))).toBe('not_owner');
    expect(errorOf(useItem(s, 'o2', 'нет-такой'))).toBe('not_found');
    const offered = run(s, { type: 'offer.create', to: 'o6', give: bundle({ items: [item.id] }), get: bundle({ gold: 1 }) }, player('o2'));
    if (!offered.ok) throw new Error(offered.error);
    expect(errorOf(useItem(offered.state, 'o2', item.id))).toBe('reserved');
  });

  test('ведущий → forbidden; не в акте → phase', () => {
    const { state: s, item } = craft(makeGame(30), 'o2', 'ward');
    expect(errorOf(run(s, { type: 'item.use', itemId: item.id }, gm))).toBe('forbidden');
    expect(errorOf(useItem({ ...s, phase: 'closed' } as GameState, 'o2', item.id))).toBe('phase');
  });
});

/** Кладёт вещь игроку прямой правкой состояния. */
function give(s: GameState, key: string, id: string, kind: 'potion' | 'shape'): GameState {
  const item: Item = { id, kind, ref: kind === 'potion' ? 'cleanse' : 'shape', owner: { type: 'player', key }, createdBy: key };
  return { ...s, items: { ...s.items, [id]: item } };
}

const shape = (s: GameState, key: string, itemId: string, guise: unknown, target?: string, now = 0) =>
  run(s, { type: 'item.use', itemId, guise: guise as string, ...(target !== undefined ? { target } : {}) }, player(key), now);

/** Успешная команда с проверкой инвариантов. */
function ok(r: ReturnType<typeof run>): Extract<ReturnType<typeof run>, { ok: true }> {
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  checkInvariants(r.state);
  return r;
}

/** Запрос согласия на вещь: событие и запрос. */
function requested(r: ReturnType<typeof run>) {
  const e = ok(r).events[0];
  if (e.type !== 'ConsentRequested') throw new Error(`ожидался ConsentRequested, пришло ${e.type}`);
  return { state: ok(r).state, req: e.request };
}

describe('item.use: Очищающее зелье', () => {
  test('на себя: Эльмар снимает проклятие', () => {
    const s = give(makeGame(30), 'o9', 'p1', 'potion');
    const r = ok(useItem(s, 'o9', 'p1'));
    expect(r.events).toEqual([{
      type: 'ItemUsed', at: 0, player: 'o9', itemId: 'p1', kind: 'potion', target: 'o9',
      effects: [{ type: 'itemRemoved', itemId: 'p1' }, { type: 'curse', player: 'o9', value: false }],
      removed: { curse: true, thorns: false },
    }]);
    expect(r.state.players.o9.curse).toBe(false);
    expect(r.state.items.p1).toBeUndefined();
    expect(r.state.actions.at(-1)).toMatchObject({ source: { type: 'item', kind: 'potion' }, removed: { curse: true, thorns: false } });
  });

  test('на себя без отметок: ничего не снято, зелье исчезло', () => {
    const s = give(makeGame(30), 'o1', 'p1', 'potion');
    const r = ok(useItem(s, 'o1', 'p1', 'o1'));
    expect(r.events[0]).toMatchObject({ effects: [{ type: 'itemRemoved', itemId: 'p1' }], removed: { curse: false, thorns: false } });
    expect(r.state.items.p1).toBeUndefined();
  });

  test('на другого: запрос, вещь в резерве; нельзя предложить, вложить, применить ещё раз', () => {
    const s = give(makeGame(30), 'o2', 'p1', 'potion');
    const { state: s1, req } = requested(useItem(s, 'o2', 'p1', 'o9'));
    expect(req).toMatchObject({ author: 'o2', action: { type: 'item', itemId: 'p1', target: 'o9' }, approvers: ['o9'], status: 'pending' });
    expect(s1.items.p1.reservedFor).toBe(req.id);
    expect(s1.players.o9.curse).toBe(true);

    const offer = run(s1, { type: 'offer.create', to: 'o6', give: bundle({ items: ['p1'] }), get: bundle({ gold: 1 }) }, player('o2'));
    expect(errorOf(offer)).toBe('reserved');
    const side = Object.keys(s1.altars)[0] as 'wake';
    expect(errorOf(run(s1, { type: 'altar.contribute', side, itemId: 'p1' }, player('o2')))).toBe('reserved');
    expect(errorOf(useItem(s1, 'o2', 'p1'))).toBe('reserved');

    const r = ok(run(s1, { type: 'consent.accept', id: req.id }, player('o9')));
    expect(r.events[1]).toEqual({
      type: 'ItemUsed', at: 0, player: 'o2', itemId: 'p1', kind: 'potion', target: 'o9',
      effects: [{ type: 'itemRemoved', itemId: 'p1' }, { type: 'curse', player: 'o9', value: false }],
      removed: { curse: true, thorns: false }, requestId: req.id,
    });
    expect(r.state.items.p1).toBeUndefined();
    expect(r.state.players.o9.curse).toBe(false);
    expect(r.state.requests[req.id].status).toBe('accepted');
    // Вещь не тратит применение способности.
    expect(r.state.players.o2.abilityUsedInAct).toBe(false);
  });

  test('отказ: вещь свободна и осталась у автора; цель вне ярмарки → not_found', () => {
    const s = give(makeGame(30), 'o2', 'p1', 'potion');
    expect(errorOf(useItem(s, 'o2', 'p1', 'zz'))).toBe('not_found');
    const { state: s1, req } = requested(useItem(s, 'o2', 'p1', 'o9'));
    const r = ok(run(s1, { type: 'consent.decline', id: req.id }, player('o9')));
    expect(r.state.items.p1).toEqual(s.items.p1);
    expect(r.state.requests[req.id].status).toBe('declined');
    ok(useItem(r.state, 'o2', 'p1'));
  });

  test('вещь пропала из рук до ответа → failed, резерв снят', () => {
    const s = give(makeGame(30), 'o2', 'p1', 'potion');
    const { state: s1, req } = requested(useItem(s, 'o2', 'p1', 'o9'));
    const moved = { ...s1, items: { ...s1.items, p1: { ...s1.items.p1, owner: { type: 'player' as const, key: 'o6' } } } };
    const r = ok(run(moved, { type: 'consent.accept', id: req.id }, player('o9')));
    expect(r.events[1]).toMatchObject({ type: 'ConsentClosed', status: 'failed' });
    expect(r.state.items.p1.reservedFor).toBeUndefined();
  });

  test('запрос указывает на прототипный ключ вещи → failed, а не падение', () => {
    const s = give(makeGame(30), 'o2', 'p1', 'potion');
    const { state: s1, req } = requested(useItem(s, 'o2', 'p1', 'o9'));
    const { reservedFor: _r, ...free } = s1.items.p1;
    const broken = {
      ...s1, items: { ...s1.items, p1: free },
      requests: { ...s1.requests, [req.id]: { ...req, action: { ...req.action, itemId: 'constructor' } } },
    };
    const r = ok(run(broken, { type: 'consent.accept', id: req.id }, player('o9')));
    expect(r.events[1]).toMatchObject({ type: 'ConsentClosed', status: 'failed', reason: 'вещи больше нет у автора' });
  });
});

describe('прототипные ключи вещей', () => {
  test('item.use и способности с itemId constructor/__proto__/toString → not_found', () => {
    const s = makeGame(30);
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(errorOf(useItem(s, 'o2', id))).toBe('not_found');
      for (const [key, kind] of [['t1', 'sellToBank'], ['o13', 'disassemble']] as const) {
        const use = kind === 'sellToBank' ? { kind, itemId: id } : { kind, itemId: id, take: ['ash', 'moon'] as ['ash', 'moon'] };
        const r = run(s, { type: 'ability.use', use }, player(key));
        expect(r.ok ? 'ok' : r.error).toBe('not_found');
      }
    }
  });
});

describe('item.use: Камень облика', () => {
  test('облик пустой, из пробелов, длиннее 40, с переводом строки, не строка → invalid', () => {
    const s = give(makeGame(30), 'o15', 'k1', 'shape');
    for (const g of ['', '   ', 'я'.repeat(41), 'Сивер\nвторой', undefined, 7]) {
      expect(errorOf(shape(s, 'o15', 'k1', g))).toBe('invalid');
    }
    expect(errorOf(shape(s, 'o15', 'k1', ` ${'я'.repeat(40)} `))).toBe('ok');
  });

  test('на себя: облик у автора, Камень исчез', () => {
    const s = give(makeGame(30), 'o15', 'k1', 'shape');
    const r = ok(shape(s, 'o15', 'k1', '  Человек по имени Сивер ', undefined, 900));
    expect(r.events).toEqual([{
      type: 'ItemUsed', at: 900, player: 'o15', itemId: 'k1', kind: 'shape', target: 'o15',
      effects: [{ type: 'itemRemoved', itemId: 'k1' }, { type: 'guise', player: 'o15', value: { name: 'Человек по имени Сивер', at: 900, by: 'o15' } }],
      guise: 'Человек по имени Сивер',
    }]);
    expect(r.state.players.o15.guise).toEqual({ name: 'Человек по имени Сивер', at: 900, by: 'o15' });
    expect(r.state.items.k1).toBeUndefined();
  });

  test('на другого через запрос; новый Камень заменяет облик', () => {
    const s = give(give(makeGame(30), 'o17', 'k1', 'shape'), 'o17', 'k2', 'shape');
    const { state: s1, req } = requested(shape(s, 'o17', 'k1', 'Странник', 'o2'));
    expect(req.action).toEqual({ type: 'item', itemId: 'k1', target: 'o2', guise: 'Странник' });
    expect(s1.items.k1.reservedFor).toBe(req.id);
    const r = ok(run(s1, { type: 'consent.accept', id: req.id }, player('o2'), 100));
    expect(r.events[1]).toMatchObject({ type: 'ItemUsed', kind: 'shape', target: 'o2', guise: 'Странник', requestId: req.id });
    expect(r.state.players.o2.guise).toEqual({ name: 'Странник', at: 100, by: 'o17' });

    const { state: s2, req: q2 } = requested(shape(r.state, 'o17', 'k2', 'Мельник', 'o2'));
    const r2 = ok(run(s2, { type: 'consent.accept', id: q2.id }, player('o2'), 200));
    expect(r2.state.players.o2.guise).toEqual({ name: 'Мельник', at: 200, by: 'o17' });
  });
});
