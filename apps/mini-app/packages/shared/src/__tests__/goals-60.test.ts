import { describe, expect, test } from 'vitest';
import { ABILITY_BY_ROLE } from '../abilities';
import type { AbilityUse } from '../commands';
import { goalDone } from '../engine/closing';
import { GOALS, type GoalCondition } from '../goals';
import type { Ingredient } from '../types';
import { Fair, checkInvariants, content, makeGame } from './helpers';

type Cond<T extends GoalCondition['type']> = Extract<GoalCondition, { type: T }>;

/** Цели, выполненные раздачей: роль начинает с реликвией своей цели. */
const START_HELD: Record<string, string> = { 'o14:1': 'Костяная флейта', 't4:1': 'Ключ от ворот' };

/** Все 60 целей: роль, индекс, условие. */
const CASES = Object.entries(GOALS).flatMap(([key, pair]) =>
  pair.map((cond, i) => ({ key, i, cond, name: `${key} ${content.roleByKey[key].name}, цель ${i + 1}: ${cond.type}` })));

const done = (f: Fair, key: string, cond: GoalCondition) => goalDone(f.s, content, key, cond);

/** Другие участники для целей «разные игроки», без автора; o9 (проклят) и o12 оставлены сценариям очищения. */
const others = (key: string, n: number) => ['o1', 'o2', 'o3', 'o5', 'o6', 'o7'].filter(k => k !== key).slice(0, n);
const RECIPE_OF = { potion: 'cleanse', ward: 'ward', focus: 'focus', shape: 'shape' } as const;
const CRAFT_ORDER = ['cleanse', 'ward', 'focus', 'shape'];

// --- Сценарии: по одному на вид условия, параметр — роль ---

function holdItem(f: Fair, key: string, c: Cond<'holdItem'>): void {
  const it = f.find('relic', c.ref);
  if (it.owner.type !== 'player' || it.owner.key !== key) f.moveTo(it.id, key);
}

function holdRelics(f: Fair, key: string, c: Cond<'holdRelics'>): void {
  const mine = f.owned(key).filter(i => i.kind === 'relic').length;
  const foreign = Object.values(f.s.items).filter(i => i.kind === 'relic' && i.owner.type === 'player' && i.owner.key !== key);
  for (const it of foreign.slice(0, c.count - mine)) f.moveTo(it.id, key);
}

function holdCraftedKinds(f: Fair, key: string, c: Cond<'holdCraftedKinds'>): void {
  for (const r of CRAFT_ORDER.slice(0, c.count)) f.craft(key, r);
}

function holdKind(f: Fair, key: string, c: Cond<'holdKind'>): void {
  for (let n = 0; n < c.count; n++) f.craft(key, RECIPE_OF[c.kind]);
}

/** Улика A приходит с лотом акта II, B и C переносит ведущий. */
function holdClues(f: Fair, key: string): void {
  f.nextAct();
  f.winLot(key, 2);
  for (const ref of ['B', 'C']) f.moveTo(f.find('clue', ref).id, key);
}

function goldAtLeast(f: Fair, key: string, c: Cond<'goldAtLeast'>): void {
  f.addGold(key, c.value - f.s.players[key].gold);
}

function craftedKinds(f: Fair, key: string, c: Cond<'craftedKinds'>): void {
  for (const r of CRAFT_ORDER.slice(0, c.count)) f.craft(key, r);
}

function soldCrafted(f: Fair, key: string, c: Cond<'soldCrafted'>): void {
  const buyers = others(key, c.distinctBuyers);
  for (let n = 0; n < c.count; n++) f.trade(key, buyers[n % buyers.length], { items: [f.craft(key, 'cleanse')] }, { gold: c.minPrice });
}

/** Золото в обмен на Пепел, который ведущий заранее даёт партнёру. */
function exchanges(f: Fair, key: string, c: Cond<'exchanges'>): void {
  for (const p of others(key, c.distinctPartners)) {
    f.addIngredients(p, { ash: 1 });
    f.trade(key, p, { gold: 1 }, { ingredients: { ash: 1, moon: 0, dew: 0 } });
  }
}

/** Плательщик предлагает золото за услугу, исполнитель принимает. */
function servicePaid(f: Fair, key: string, c: Cond<'servicePaid'>): void {
  for (const p of others(key, c.distinctPayers)) f.trade(p, key, { gold: c.minGold }, {}, true);
}

/** Применение способности роли на цель (для abilityUsed). */
function useOf(f: Fair, key: string, target: string): AbilityUse {
  const kind = ABILITY_BY_ROLE[key];
  switch (kind) {
    case 'stealGold': case 'thorns': case 'askSide': case 'protectOther': return { kind, target };
    case 'stealIngredient': {
      const ings = f.s.players[target].ingredients;
      const ingredient = (Object.keys(ings) as Ingredient[]).find(k => ings[k] > 0)!;
      return { kind, target, ingredient };
    }
    default: throw new Error(`нет сценария для способности ${kind}`);
  }
}

/** По применению за акт, цели разные. */
function abilityUsed(f: Fair, key: string, c: Cond<'abilityUsed'>): void {
  const targets = others(key, Math.max(c.count, c.distinctTargets ?? 1));
  targets.forEach((t, n) => {
    if (n > 0) f.nextAct();
    f.ability(key, useOf(f, key, t));
  });
}

function shapeSelf(f: Fair, key: string): void {
  f.useItem(key, f.craft(key, 'shape'), undefined, 'Странник в сером');
}

/** Эльмар проклят с раздачи и пьёт своё зелье. */
function cleansed(f: Fair, key: string): void {
  f.useItem(key, f.craft(key, 'cleanse'));
}

/** Первая цель — проклятый Эльмар; следующие получают шипы от Ивы в новом акте. */
function cleanseOthers(f: Fair, key: string, c: Cond<'cleanseOthers'>): void {
  f.ability(key, { kind: 'cleanseOther', target: 'o9' });
  for (const t of others(key, c.distinctTargets - 1)) {
    f.nextAct();
    f.ability('o12', { kind: 'thorns', target: t });
    f.ability(key, { kind: 'cleanseOther', target: t });
  }
}

function contributedGold(f: Fair, key: string, c: Cond<'contributedGold'>): void {
  f.contribute(key, c.side, { gold: c.value });
}

function contributedFocus(f: Fair, key: string, c: Cond<'contributedFocus'>): void {
  for (let n = 0; n < c.count; n++) f.contribute(key, c.side, { itemId: f.craft(key, 'focus') });
}

function contributedShard(f: Fair, key: string, c: Cond<'contributedShard'>): void {
  const shard = f.find('shard', 'I');
  f.moveTo(shard.id, key);
  f.contribute(key, c.side, { itemId: shard.id });
}

function gaveKind(f: Fair, key: string, c: Cond<'gaveKind'>): void {
  const receivers = others(key, c.distinctReceivers);
  for (let n = 0; n < c.count; n++) f.trade(key, receivers[n % receivers.length], { items: [f.craft(key, RECIPE_OF[c.kind])] });
}

function protectedOthers(f: Fair, key: string, c: Cond<'protectedOthers'>): void {
  others(key, c.distinctTargets).forEach((t, n) => {
    if (n > 0) f.nextAct();
    f.ability(key, { kind: 'protectOther', target: t });
  });
}

/** Зелье на Эльмара с его согласия. */
function potionOnOther(f: Fair, key: string): void {
  f.useItem(key, f.craft(key, 'cleanse'), 'o9');
}

/** Сценарий выполнения цели командами на свежей ярмарке 30. */
function achieve(key: string, cond: GoalCondition): Fair {
  const f = new Fair(makeGame(30));
  switch (cond.type) {
    case 'holdItem': holdItem(f, key, cond); break;
    case 'holdRelics': holdRelics(f, key, cond); break;
    case 'holdCraftedKinds': holdCraftedKinds(f, key, cond); break;
    case 'holdKind': holdKind(f, key, cond); break;
    case 'holdClues': holdClues(f, key); break;
    case 'goldAtLeast': goldAtLeast(f, key, cond); break;
    case 'craftedKinds': craftedKinds(f, key, cond); break;
    case 'soldCrafted': soldCrafted(f, key, cond); break;
    case 'exchanges': exchanges(f, key, cond); break;
    case 'servicePaid': servicePaid(f, key, cond); break;
    case 'abilityUsed': abilityUsed(f, key, cond); break;
    case 'shapeSelf': shapeSelf(f, key); break;
    case 'cleansed': cleansed(f, key); break;
    case 'cleanseOthers': cleanseOthers(f, key, cond); break;
    case 'contributedGold': contributedGold(f, key, cond); break;
    case 'contributedFocus': contributedFocus(f, key, cond); break;
    case 'contributedShard': contributedShard(f, key, cond); break;
    case 'gaveKind': gaveKind(f, key, cond); break;
    case 'protectedOthers': protectedOthers(f, key, cond); break;
    case 'potionOnOther': potionOnOther(f, key); break;
  }
  return f;
}

describe('60 целей: старт', () => {
  test('на свежей ярмарке 30 выполнены только цели реликвий, розданных их же ролям', () => {
    const s = makeGame(30);
    const doneAtStart = CASES.filter(c => goalDone(s, content, c.key, c.cond)).map(c => `${c.key}:${c.i}`);
    expect(doneAtStart.sort()).toEqual(Object.keys(START_HELD).sort());
  });
});

describe('60 целей: не выполнено', () => {
  test.each(CASES)('$name', ({ key, i, cond }) => {
    const f = new Fair(makeGame(30));
    // Стартовую реликвию сначала забирает ведущий.
    const held = START_HELD[`${key}:${i}`];
    if (held) f.moveTo(f.find('relic', held).id, 'o1');
    expect(done(f, key, cond)).toBe(false);
  });
});

describe('60 целей: выполнено после сценария', () => {
  test.each(CASES)('$name', ({ key, cond }) => {
    const f = achieve(key, cond);
    checkInvariants(f.s);
    expect(done(f, key, cond)).toBe(true);
  });
});

describe('60 целей: края', () => {
  test('exchanges: сделка, где одна сторона отдала только слух или ничего, не считается', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.o3[1] as Cond<'exchanges'>;
    const [a, b, d] = others('o3', 3);
    f.addIngredients(a, { ash: 1 });
    f.trade('o3', a, { gold: 1 }, { ingredients: { ash: 1, moon: 0, dew: 0 } });
    f.trade('o3', b, { gold: 1 }, { rumor: 'говорят, Ящик пуст' });
    f.trade('o3', d, { gold: 1 });
    expect(done(f, 'o3', c)).toBe(false);
    // Третий настоящий обмен — цель выполнена; партнёр с любой стороны сделки.
    f.addIngredients('o3', { dew: 1 });
    f.trade(d, 'o3', { gold: 1 }, { ingredients: { ash: 0, moon: 0, dew: 1 } });
    f.addIngredients(b, { moon: 1 });
    f.trade(b, 'o3', { ingredients: { ash: 0, moon: 1, dew: 0 } }, { gold: 1 });
    expect(done(f, 'o3', c)).toBe(true);
  });

  test('exchanges: повтор с тем же партнёром не добавляет партнёра', () => {
    const f = new Fair(makeGame(30));
    const [a, b] = others('o3', 2);
    for (const p of [a, a, b]) {
      f.addIngredients(p, { ash: 1 });
      f.trade('o3', p, { gold: 1 }, { ingredients: { ash: 1, moon: 0, dew: 0 } });
    }
    expect(done(f, 'o3', GOALS.o3[1])).toBe(false);
  });

  test('servicePaid: оплата без service не считается; исполнитель-автор предложения считается', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.o14[0];
    const [a, b] = others('o14', 2);
    f.trade(a, 'o14', { gold: 1 });
    f.trade(b, 'o14', { gold: 1 });
    expect(done(f, 'o14', c)).toBe(false);
    f.trade(a, 'o14', { gold: 1 }, {}, true);
    expect(done(f, 'o14', c)).toBe(false);
    // Лира сама предлагает услугу и просит золото.
    f.trade('o14', b, {}, { gold: 1 }, true);
    expect(done(f, 'o14', c)).toBe(true);
  });

  test('soldCrafted: вещь, изготовленная другим, не считается', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.o6[1];
    const foreign = f.craft('o1', 'ward');
    f.trade('o1', 'o6', { items: [foreign] });
    f.trade('o6', 'o2', { items: [f.craft('o6', 'cleanse')] }, { gold: 1 });
    f.trade('o6', 'o3', { items: [foreign] }, { gold: 1 });
    expect(done(f, 'o6', c)).toBe(false);
    // Своя вещь бесплатно тоже не продажа.
    f.trade('o6', 'o3', { items: [f.craft('o6', 'ward')] });
    expect(done(f, 'o6', c)).toBe(false);
    f.trade('o6', 'o3', { items: [f.craft('o6', 'focus')] }, { gold: 1 });
    expect(done(f, 'o6', c)).toBe(true);
  });

  test('soldCrafted: две вещи в одной сделке считаются обе, но покупатель один', () => {
    const f = new Fair(makeGame(30));
    f.trade('o6', 'o2', { items: [f.craft('o6', 'cleanse'), f.craft('o6', 'ward')] }, { gold: 2 });
    expect(done(f, 'o6', { type: 'soldCrafted', count: 2, distinctBuyers: 1, minPrice: 1 })).toBe(true);
    expect(done(f, 'o6', GOALS.o6[1])).toBe(false);
  });

  test('abilityUsed: отражённая попытка не считается', () => {
    const f = new Fair(makeGame(30));
    f.ability('o4', { kind: 'protectSelf' });
    f.ability('o8', { kind: 'stealGold', target: 'o4' });
    expect(f.s.actions.at(-1)).toMatchObject({ author: 'o8', outcome: 'blocked' });
    expect(done(f, 'o8', GOALS.o8[1])).toBe(false);
    f.nextAct();
    f.ability('o8', { kind: 'stealGold', target: 'o4' });
    expect(done(f, 'o8', GOALS.o8[1])).toBe(true);
  });

  test('abilityUsed: копия Астры не считается ни Астре, ни владельцу оригинала', () => {
    const f = new Fair(makeGame(30));
    f.ability('o17', { kind: 'copyAbility', copy: { kind: 'grow', give: 'ash' } });
    expect(f.s.actions.at(-1)).toMatchObject({ author: 'o17', outcome: 'done', source: { type: 'ability', copied: 'grow' } });
    const once: GoalCondition = { type: 'abilityUsed', count: 1 };
    expect(done(f, 'o17', once)).toBe(false);
    expect(done(f, 'o2', once)).toBe(false);
    f.ability('o2', { kind: 'grow', give: 'moon' });
    expect(done(f, 'o2', once)).toBe(true);
  });

  test('abilityUsed: две записи на одну цель не дают двух разных целей', () => {
    const f = new Fair(makeGame(30));
    f.ability('o12', { kind: 'thorns', target: 'o1' });
    f.nextAct();
    f.ability('o12', { kind: 'thorns', target: 'o1' });
    expect(done(f, 'o12', { type: 'abilityUsed', count: 2 })).toBe(true);
    expect(done(f, 'o12', GOALS.o12[0])).toBe(false);
  });

  test('cleanseOthers: очищение чистой цели не считается', () => {
    const f = new Fair(makeGame(30));
    f.ability('o10', { kind: 'cleanseOther', target: 'o1' });
    expect(f.s.actions.at(-1)).toMatchObject({ author: 'o10', outcome: 'done', removed: { curse: false, thorns: false } });
    expect(done(f, 'o10', GOALS.o10[0])).toBe(false);
  });

  test('cleansed: своё зелье считается, очищение Адой считается, снятие ведущим нет', () => {
    const own = achieve('o9', GOALS.o9[0]);
    expect(own.s.actions.at(-1)).toMatchObject({ author: 'o9', target: 'o9', source: { type: 'item', kind: 'potion' } });
    expect(done(own, 'o9', GOALS.o9[0])).toBe(true);

    const ada = new Fair(makeGame(30));
    ada.ability('o10', { kind: 'cleanseOther', target: 'o9' });
    expect(done(ada, 'o9', GOALS.o9[0])).toBe(true);

    const gmFix = new Fair(makeGame(30));
    gmFix.correct('o9', { field: 'curse', value: false });
    expect(gmFix.s.players.o9.curse).toBe(false);
    expect(done(gmFix, 'o9', GOALS.o9[0])).toBe(false);
  });

  test('potionOnOther: зелье на себя не считается', () => {
    const f = new Fair(makeGame(30));
    f.useItem('o2', f.craft('o2', 'cleanse'));
    expect(done(f, 'o2', GOALS.o2[1])).toBe(false);
  });

  test('contributedGold: забранный вклад не считается, вклады суммируются', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.t1[0];
    const id = f.contribute('t1', 'ship', { gold: 4 });
    expect(done(f, 't1', c)).toBe(true);
    f.as('t1', { type: 'altar.withdraw', contributionId: id });
    expect(done(f, 't1', c)).toBe(false);
    f.contribute('t1', 'ship', { gold: 3 });
    // Чужое золото и золото на другом алтаре не в счёт.
    f.contribute('t2', 'ship', { gold: 1 });
    f.contribute('t1', 'wake', { gold: 1 });
    expect(done(f, 't1', c)).toBe(false);
    f.contribute('t1', 'ship', { gold: 1 });
    expect(done(f, 't1', c)).toBe(true);
  });

  test('contributedFocus и contributedShard: забранная вещь не считается', () => {
    const f = new Fair(makeGame(30));
    const focus = f.contribute('o1', 'wake', { itemId: f.craft('o1', 'focus') });
    const shardId = f.find('shard', 'I').id;
    f.moveTo(shardId, 't3');
    const shard = f.contribute('t3', 'ship', { itemId: shardId });
    expect(done(f, 'o1', GOALS.o1[1])).toBe(true);
    expect(done(f, 't3', GOALS.t3[0])).toBe(true);
    f.as('o1', { type: 'altar.withdraw', contributionId: focus });
    f.as('t3', { type: 'altar.withdraw', contributionId: shard });
    expect(done(f, 'o1', GOALS.o1[1])).toBe(false);
    expect(done(f, 't3', GOALS.t3[0])).toBe(false);
  });

  test('protectedOthers: талисман не считается', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.t3[1];
    f.ability('t3', { kind: 'protectOther', target: 'o1' });
    f.nextAct();
    f.ability('t3', { kind: 'protectOther', target: 'o2' });
    f.useItem('t3', f.craft('t3', 'ward'));
    expect(f.s.actions.at(-1)).toMatchObject({ author: 't3', source: { type: 'item', kind: 'ward' } });
    expect(done(f, 't3', c)).toBe(false);
  });

  test('holdKind ward: активированный талисман не считается', () => {
    const f = new Fair(makeGame(30));
    f.useItem('o12', f.craft('o12', 'ward'));
    expect(done(f, 'o12', GOALS.o12[1])).toBe(false);
  });

  test('holdCraftedKinds: вещи, изготовленные другими, считаются', () => {
    const f = new Fair(makeGame(30));
    f.trade('o6', 'o13', { items: [f.craft('o6', 'cleanse'), f.craft('o6', 'ward')] });
    expect(done(f, 'o13', GOALS.o13[1])).toBe(true);
  });

  test('gaveKind: перекованный талисман Хельги считается', () => {
    const f = new Fair(makeGame(30));
    const c = GOALS.n20[1];
    const forge = () => {
      const before = new Set(f.owned('n20').map(i => i.id));
      f.ability('n20', { kind: 'reforge', itemId: f.craft('n20', 'cleanse'), into: 'ward' });
      return f.owned('n20').find(i => !before.has(i.id) && i.kind === 'ward')!;
    };
    const first = forge();
    expect(first.createdBy).toBe('n20');
    f.trade('n20', 'o1', { items: [first.id] });
    f.nextAct();
    f.trade('n20', 'o2', { items: [forge().id] }, { gold: 1 });
    expect(done(f, 'n20', c)).toBe(true);
  });

  test('gaveKind: два Фокуса одному получателю — получатель один', () => {
    const f = new Fair(makeGame(30));
    f.trade('o16', 'o1', { items: [f.craft('o16', 'focus')] });
    f.trade('o16', 'o1', { items: [f.craft('o16', 'focus')] });
    expect(done(f, 'o16', GOALS.o16[0])).toBe(false);
  });

  test('holdClues: две улики не считаются', () => {
    const f = new Fair(makeGame(30));
    for (const ref of ['B', 'C']) f.moveTo(f.find('clue', ref).id, 'o11');
    expect(done(f, 'o11', GOALS.o11[1])).toBe(false);
  });
});

