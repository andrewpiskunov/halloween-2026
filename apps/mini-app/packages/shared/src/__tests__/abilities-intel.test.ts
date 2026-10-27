import { describe, expect, test } from 'vitest';
import { content, gm, makeGame, allBut, player, run } from './helpers';
import type { AbilityUse } from '../commands';
import type { Bundle, Counts, GameState, Player } from '../types';

const zero = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zero(), items: [], ...b });
const withPlayer = (s: GameState, key: string, patch: Partial<Player>): GameState => ({
  ...s, players: { ...s.players, [key]: { ...s.players[key], ...patch } },
});

const use = (s: GameState, key: string, u: AbilityUse) => run(s, { type: 'ability.use', use: u }, player(key));

function must(r: ReturnType<typeof run>): GameState {
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  return r.state;
}

/** Наблюдение исполнено: одно событие без эффектов, не враждебно, intel в событии и в журнале. */
function observed(s: GameState, key: string, u: AbilityUse, target?: string) {
  const r = use(s, key, u);
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ''}`);
  expect(r.events).toHaveLength(1);
  expect(r.events[0]).toMatchObject({ type: 'AbilityUsed', author: key, ability: u.kind, outcome: 'done', hostile: false, effects: [] });
  expect((r.events[0] as { target?: string }).target).toBe(target);
  expect(r.state.players[key].abilityUsedInAct).toBe(true);
  const rec = r.state.actions.at(-1)!;
  expect(rec).toMatchObject({ author: key, outcome: 'done', hostile: false, effects: [] });
  if (target) expect(r.state.players[target].hostileAttemptsAgainstInAct).toBe(0);
  const intel = (r.events[0] as { intel?: unknown }).intel;
  expect(intel).toBeDefined();
  expect(rec.intel).toEqual(intel);
  return { r, intel: intel as Record<string, unknown> };
}

/** Отказ без расхода. */
function refused(s: GameState, key: string, u: AbilityUse, code: string) {
  const r = use(s, key, u);
  expect(r.ok ? 'ok' : r.error).toBe(code);
}

/** Защищённая цель наблюдение не останавливает. */
function notBlockedByProtection(s: GameState, key: string, u: AbilityUse, target: string) {
  const p = withPlayer(s, target, { protection: { by: target, source: 'ward' } });
  const { r } = observed(p, key, u, target);
  expect(r.state.players[target].protection).toEqual({ by: target, source: 'ward' });
}

const nextAct = (s: GameState) => must(run(s, { type: 'act.next' }, gm));
const shardV = (s: GameState) => Object.values(s.items).find(i => i.kind === 'shard' && i.ref === 'V')!;

describe('inspectInventory (Корвин o11)', () => {
  test('акт I: снимок Лиры без скрытого осколка V; акт III: с ним', () => {
    const s = makeGame(30);
    expect(shardV(s).owner).toEqual({ type: 'player', key: 'o14' });
    expect(shardV(s).hiddenUntilAct).toBe(3);

    const { intel } = observed(s, 'o11', { kind: 'inspectInventory', target: 'o14' }, 'o14');
    const lira = s.players.o14;
    const own = Object.values(s.items).filter(i => i.owner.type === 'player' && i.owner.key === 'o14' && !i.hiddenUntilAct);
    expect(intel).toEqual({
      kind: 'inventory', target: 'o14', gold: lira.gold, reservedGold: lira.reservedGold, ingredients: lira.ingredients,
      items: own.map(i => ({ kind: i.kind, ref: i.ref })),
    });
    expect((intel.items as { ref: string }[]).some(i => i.ref === 'V')).toBe(false);

    const s3 = nextAct(nextAct(s));
    expect(s3.phase).toBe('act3');
    const r3 = observed(s3, 'o11', { kind: 'inspectInventory', target: 'o14' }, 'o14');
    expect(r3.intel.items).toContainEqual({ kind: 'shard', ref: 'V' });
  });

  test('скрытый осколок отфильтрован и в акте II, даже если поле осталось', () => {
    const s2 = nextAct(makeGame(30));
    expect(s2.phase).toBe('act2');
    const { intel } = observed(s2, 'o11', { kind: 'inspectInventory', target: 'o14' }, 'o14');
    expect((intel.items as { ref: string }[]).some(i => i.ref === 'V')).toBe(false);
  });

  test('на себя → invalid; неверная форма → invalid; защита не блокирует', () => {
    const s = makeGame(30);
    refused(s, 'o11', { kind: 'inspectInventory', target: 'o11' }, 'invalid');
    refused(s, 'o11', { kind: 'inspectInventory', target: '' }, 'invalid');
    notBlockedByProtection(s, 'o11', { kind: 'inspectInventory', target: 'o14' }, 'o14');
  });
});

describe('sniffIngredient (Сив o15)', () => {
  test('список присутствующих с Росой, без автора и отсутствующих; резерв считается', () => {
    const absent = ['o12', 'r3'];
    let s = makeGame(30, { present: allBut(30, absent) });
    // У всех ровно по одной Росе: так видно, кто попал в список.
    for (const k of s.roster) s = withPlayer(s, k, { ingredients: { ...s.players[k].ingredients, dew: 0 } });
    for (const k of ['o15', 'o12', 'r3', 'o11', 't2']) s = withPlayer(s, k, { ingredients: { ...s.players[k].ingredients, dew: 1 } });
    // Роса Торвина обещана в сделке, но всё ещё у него.
    s = must(run(s, { type: 'offer.create', to: 'o11', give: bundle({ ingredients: { ash: 0, moon: 0, dew: 1 } }), get: bundle() }, player('t2')));

    const { intel } = observed(s, 'o15', { kind: 'sniffIngredient', ingredient: 'dew' });
    expect(intel).toEqual({ kind: 'sniff', ingredient: 'dew', holders: s.roster.filter(k => k === 'o11' || k === 't2') });
  });

  test('неизвестный ингредиент → invalid', () => {
    refused(makeGame(30), 'o15', { kind: 'sniffIngredient', ingredient: 'gold' as never }, 'invalid');
  });
});

describe('knowGold (Торвин t2)', () => {
  test('золото цели целиком, включая резерв сделки; на себя → invalid; защита не блокирует', () => {
    let s = makeGame(30);
    s = must(run(s, { type: 'offer.create', to: 'o11', give: bundle({ gold: 1 }), get: bundle() }, player('o14')));
    expect(s.players.o14.reservedGold).toBe(1);
    const { intel } = observed(s, 't2', { kind: 'knowGold', target: 'o14' }, 'o14');
    expect(intel).toEqual({ kind: 'gold', target: 'o14', gold: s.players.o14.gold });
    refused(s, 't2', { kind: 'knowGold', target: 't2' }, 'invalid');
    notBlockedByProtection(s, 't2', { kind: 'knowGold', target: 'o14' }, 'o14');
  });
});

describe('askSide (Марта r2)', () => {
  test('несвободный: сторона роли; свободный без выбора: free; свободный с выбором: выбранная', () => {
    const s = makeGame(30);
    const bound = content.roles.find(r => r.side !== 'free' && r.key !== 'r2')!;
    const free = content.roles.find(r => r.side === 'free' && r.key !== 'r2')!;
    expect(s.players[free.key].side).toBeUndefined();

    expect(observed(s, 'r2', { kind: 'askSide', target: bound.key }, bound.key).intel)
      .toEqual({ kind: 'side', target: bound.key, side: bound.side });
    expect(observed(s, 'r2', { kind: 'askSide', target: free.key }, free.key).intel)
      .toEqual({ kind: 'side', target: free.key, side: 'free' });
    const chosen = withPlayer(s, free.key, { side: 'ship' });
    expect(observed(chosen, 'r2', { kind: 'askSide', target: free.key }, free.key).intel)
      .toEqual({ kind: 'side', target: free.key, side: 'ship' });

    refused(s, 'r2', { kind: 'askSide', target: 'r2' }, 'invalid');
    notBlockedByProtection(s, 'r2', { kind: 'askSide', target: bound.key }, bound.key);
  });
});

describe('askYesNo (Веста r5)', () => {
  test('вопрос из 300 символов обрезан до 200; цель в записи, эффекты пусты', () => {
    const s = makeGame(30);
    const q = 'я'.repeat(300);
    const { intel } = observed(s, 'r5', { kind: 'askYesNo', target: 'o11', question: q }, 'o11');
    expect(intel).toEqual({ kind: 'question', target: 'o11', question: 'я'.repeat(200) });
  });

  test('пустой вопрос и вопрос из пробелов → без вопроса; пробелы по краям срезаны', () => {
    const s = makeGame(30);
    expect(observed(s, 'r5', { kind: 'askYesNo', target: 'o11' }, 'o11').intel).toEqual({ kind: 'question', target: 'o11' });
    expect(observed(s, 'r5', { kind: 'askYesNo', target: 'o11', question: '   ' }, 'o11').intel).toEqual({ kind: 'question', target: 'o11' });
    expect(observed(s, 'r5', { kind: 'askYesNo', target: 'o11', question: '  Ты за Корабль?  ' }, 'o11').intel)
      .toEqual({ kind: 'question', target: 'o11', question: 'Ты за Корабль?' });
  });

  test('на себя → invalid; вопрос не строкой → invalid; защита не блокирует', () => {
    const s = makeGame(30);
    refused(s, 'r5', { kind: 'askYesNo', target: 'r5' }, 'invalid');
    refused(s, 'r5', { kind: 'askYesNo', target: 'o11', question: 5 as never }, 'invalid');
    notBlockedByProtection(s, 'r5', { kind: 'askYesNo', target: 'o11' }, 'o11');
  });
});
