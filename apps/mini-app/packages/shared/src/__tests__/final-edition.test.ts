import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { content as base, gm, player, testCodes, bundle } from './helpers';
import { execute, initialState, reduce } from '../engine';
import { viewFor } from '../views';
import type { Content } from '../content';
import type { Command, Actor } from '../commands';
import type { Event } from '../events';
import type { GameState, ItemKind } from '../types';
const source = JSON.parse(readFileSync(new URL('../../../../../../docs/design/gm-book/hidden-17.json', import.meta.url), 'utf8'));
source.narrative = JSON.parse(readFileSync(new URL('../../../../../../docs/design/gm-book/narrative-17.json', import.meta.url), 'utf8'));
source.narrative.documents.push({ id: 'test-notes', title: 'Запись', source: 'Свидетель', text: 'Тайный способ', holders: ['o5'], knowledge: ['joining', 'place'], methods: ['salt', 'sign', 'vessel'] });
const content: Content = { ...base, hidden17: { ...source, rulesVersion: 2, continuousFair: true } };
let uid = 0;
class G {
  s: GameState;
  now = 1000;
  log: Event[] = [];
  constructor(public c = content, absent: string[] = []) {
    this.s = initialState(c, testCodes());
    this.run({ type: 'hidden17.enable' });
    for (const roleKey of this.s.roster)
      if (!absent.includes(roleKey))
        this.run({ type: 'player.setPresent', roleKey, present: true });
    this.run({ type: 'session.open' });
  }
  try(cmd: Command, actor: Actor = gm) {
    return execute(this.s, this.c, cmd, { now: this.now, actor, newId: () => `final${++uid}`, random: () => 0 });
  }
  run(cmd: Command, actor: Actor = gm) {
    const r = this.try(cmd, actor);
    if (!r.ok)
      throw Error(`${cmd.type}: ${r.error} ${r.detail}`);
    this.s = r.state;
    this.log.push(...r.events);
    return r;
  }
  as(k: string, c: Command) {
    return this.run(c, player(k));
  }
  item(k: string, kind: ItemKind, ref: string = kind) {
    const id = `fixture${++uid}`;
    this.s.items[id] = { id, kind, ref, owner: { type: 'player', key: k } };
    return id;
  }
  shard(ref: string) {
    return Object.values(this.s.items).find(i => i.kind === 'shard' && i.ref === ref)!;
  }
  admit(k: string) {
    this.as(k, { type: 'story.request', title: 'Встреча', text: 'Прихожу к назначенному месту.', stake: '' });
    const q = Object.values(this.s.story!.requests).at(-1)!;
    this.run({ type: 'fair.admit', player: k, requestId: q.id, at: this.now });
    return q.id;
  }
  prep(k: string, method: 'salt' | 'sign' | 'vessel') {
    this.run({ type: 'hidden17.learn', player: k, method });
    this.as(k, { type: 'hidden17.prepare', method, itemId: this.item(k, method === 'sign' ? 'focus' : 'potion') });
    return Object.keys(this.s.hidden17!.prepared).at(-1)!;
  }
  ready() {
    for (const k of ['o1', 'o5', 'o9', 'o6'])
      this.admit(k);
    for (const ref of ['I', 'II', 'III']) {
      const i = this.shard(ref);
      this.as((i.owner as { key: string }).key, { type: 'hidden17.ritual.offer', itemId: i.id, include: true });
    }
    for (let i = 0; i < 2; i++)
      this.as('o1', { type: 'hidden17.ritual.offer', itemId: this.item('o1', 'focus'), include: true });
  }
  choices() {
    this.ready();
    this.run({ type: 'fair.ritual.announce' });
    this.now += 300000;
    this.run({ type: 'hidden17.ritual.start' });
    this.run({ type: 'hidden17.ritual.powder' });
    this.as('o5', { type: 'hidden17.ritual.formula', text: source.ritual.formula });
  }
  pv(k: string) {
    const v = viewFor(this.s, this.c, player(k), this.now);
    if (v.kind !== 'player')
      throw Error('view');
    return v;
  }
  outcome(freedom: 'free' | 'controlled' = 'free') {
    this.s.hidden17!.ritual.step = 'finished';
    this.s.hidden17!.ritual.outcome = { life: 'awake', freedom, ...(freedom === 'controlled' ? { controller: 'o5' } : {}), power: 'full', vessels: { o6: 'full' }, goals: {} };
  }
}
test('копия документа передаётся A→B→C, открывает методы и не отзывается', () => {
  const g = new G();
  expect(g.s.hidden17!.learned.o5).toEqual(expect.arrayContaining(['salt', 'sign', 'vessel']));
  for (const [from, to] of [['o5', 'o2'], ['o2', 'o3'], ['o2', 'o3']])
    g.as(from, { type: 'narrative.document.show', documentId: 'test-notes', player: to, allow: true });
  expect(g.s.hidden17!.narrative!.documentAccess.o3.filter(x => x === 'test-notes')).toHaveLength(1);
  expect(g.s.hidden17!.learned.o3).toEqual(expect.arrayContaining(['salt', 'sign', 'vessel']));
  expect(g.try({ type: 'narrative.document.show', documentId: 'test-notes', player: 'o3', allow: false }, player('o2')).ok).toBe(false);
  expect(g.pv('o3').hidden17!.narrative!.documents.some(d => d.id === 'test-notes')).toBe(true);
  expect(g.try({ type: 'narrative.document.show', documentId: 'test-notes', player: 'o4', allow: true }, player('o7')).ok).toBe(false);
});

test('8 монет новой редакции, legacy 6, приход без повторной выдачи и replay', () => {
  for (const version of [undefined, 2] as const) {
    const c = { ...content, hidden17: { ...content.hidden17!, rulesVersion: version } };
    const g = new G(c, ['o2']);
    expect(g.s.players.o1.gold).toBe(version === 2 ? 8 : 6);
    g.run({ type: 'player.setPresent', roleKey: 'o2', present: true });
    expect(g.s.players.o2.gold).toBe(version === 2 ? 8 : 6);
    g.run({ type: 'player.setPresent', roleKey: 'o2', present: false });
    g.run({ type: 'player.setPresent', roleKey: 'o2', present: true });
    expect(g.s.players.o2.gold).toBe(version === 2 ? 8 : 6);
    expect(g.log.reduce((s, e) => reduce(s, content, e), initialState(content, testCodes()))).toEqual(g.s);
  }
});

test.each([['cleanse', 3], ['shape', 4]] as const)('NPC %s платит %i, ремесленник базу', (recipe, price) => {
  const g = new G();
  g.s.players.o6.ingredients = { ash: 20, moon: 20, dew: 20 };
  g.s.players.o6.gold = 20;
  g.as('o6', { type: 'shop.craft', recipeId: recipe });
  expect(g.s.players.o6.gold).toBe(20 - price);
  g.as('o6', { type: 'hidden17.produce', recipeId: recipe });
  expect(g.s.players.o6.gold).toBe(20 - price - (price - 2));
});

test('бесплатная работа и скидка не убирают наценку фоновой мастерской', () => {
  const g = new G();
  g.s.players.o5.ingredients = { ash: 20, moon: 20, dew: 20 };
  g.as('o5', { type: 'ability.use', use: { kind: 'focusFree' } });
  expect(g.s.players.o5.gold).toBe(6);
  g.s.players.o6.ingredients = { ash: 20, moon: 20, dew: 20 };
  g.s.players.o6.discount = true;
  g.as('o6', { type: 'shop.craft', recipeId: 'focus' });
  expect(g.s.players.o6.gold).toBe(6);
});

test('подготовка не закрывает торг и скрыта от постороннего; start до срока атомарен', () => {
  const g = new G();
  g.ready();
  g.as('o2', { type: 'narrative.trade.create', to: 'o3', give: bundle({ gold: 1 }), wish: '' });
  expect(g.pv('o2').hidden17!.ritual.circle).toEqual([]);
  expect(g.pv('o2').hidden17!.ritual.focuses).toEqual([]);
  g.run({ type: 'fair.ritual.announce' });
  const before = structuredClone(g.s);
  expect(g.try({ type: 'hidden17.ritual.start' }).ok).toBe(false);
  expect(g.s).toEqual(before);
  g.now += 300000;
  g.run({ type: 'hidden17.ritual.start' });
  expect(g.s.hidden17!.ritual.step).toBe('assembly');
  expect(Object.values(g.s.hidden17!.narrative!.trades)[0].status).toBe('cancelled');
  expect(g.try({ type: 'shop.buy', ingredient: 'ash' }, player('o2')).ok).toBe(false);
});

test.each(['focus', 'shard', 'joining', 'presence', 'admission'])('без %s старт отклоняется и не замораживает ярмарку', invalid => {
  const g = new G();
  g.ready();
  g.run({ type: 'fair.ritual.announce' });
  g.now += 300000;
  if (invalid === 'focus')
    delete g.s.items[g.s.hidden17!.ritual.focuses[0]];
  if (invalid === 'shard')
    g.shard('II').ref = 'I';
  if (invalid === 'joining')
    for (const k of g.s.roster)
      g.s.hidden17!.narrative!.knowledge[k] = [];
  if (invalid === 'presence')
    g.run({ type: 'player.setPresent', roleKey: 'o5', present: false });
  if (invalid === 'admission')
    g.run({ type: 'fair.admission.remove', player: 'o5' });
  const before = structuredClone(g.s);
  expect(g.try({ type: 'hidden17.ritual.start' }).ok).toBe(false);
  expect(g.s).toEqual(before);
  if (['presence', 'admission'].includes(invalid))
    expect(g.shard('II').reservedFor).toBeUndefined();
});

test('повтор предупреждения не сокращает срок; пауза переносит, отмена убирает дедлайн', () => {
  const g = new G();
  g.ready();
  g.run({ type: 'fair.ritual.announce' });
  g.now += 10000;
  g.run({ type: 'fair.ritual.announce' });
  g.run({ type: 'clock.pause' });
  g.now += 500000;
  g.run({ type: 'clock.resume' });
  expect(g.s.hidden17!.fair!.ritualAnnouncement?.deadline).toBe(801000);
  g.now = 801000;
  g.run({ type: 'fair.ritual.cancel-announcement' });
  expect(g.try({ type: 'hidden17.ritual.start' }).ok).toBe(false);
  g.run({ type: 'fair.ritual.announce' });
  g.now += 300000;
  g.run({ type: 'hidden17.ritual.start' });
});

test.each(['salt', 'sign'] as const)('защита блокирует группу %s после отмены первой попытки', method => {
  const g = new G();
  const components = [g.prep('o1', method), g.prep('o1', method)], ward = g.item('o5', 'ward');
  g.choices();
  for (const itemId of components)
    g.as('o1', { type: 'hidden17.ritual.choice', kind: method, itemId, ...(method === 'salt' ? { targetId: g.shard('I').id } : {}) });
  g.run({ type: 'hidden17.ritual.reveal' });
  const [first, second] = Object.keys(g.s.hidden17!.ritual.choices);
  g.as('o5', { type: 'hidden17.ritual.ward', against: first, itemId: ward });
  g.as('o1', { type: 'hidden17.ritual.cancel', id: first });
  g.run({ type: 'hidden17.ritual.resolve' });
  expect(g.s.hidden17!.ritual.choices[second].status).toBe('blocked');
  expect(g.s.items[ward]).toBeUndefined();
});

test('разные осколки требуют двух защит; смена источника и дубликаты сохраняют лишние', () => {
  const g = new G();
  const salts = [g.prep('o1', 'salt'), g.prep('o1', 'salt')], ward = g.item('o5', 'ward'), duplicate = g.item('o6', 'ward');
  g.s.players.o5.protection = { by: 'o5', source: 'ability' };
  g.choices();
  for (let i = 0; i < 2; i++)
    g.as('o1', { type: 'hidden17.ritual.choice', kind: 'salt', itemId: salts[i], targetId: g.shard(i ? 'II' : 'I').id });
  g.run({ type: 'hidden17.ritual.reveal' });
  const [first, second] = Object.keys(g.s.hidden17!.ritual.choices);
  g.as('o5', { type: 'hidden17.ritual.ward', against: first, itemId: ward });
  g.as('o5', { type: 'hidden17.ritual.ward', against: first });
  expect(g.s.items[ward].reservedFor).toBeUndefined();
  g.as('o6', { type: 'hidden17.ritual.ward', against: first, itemId: duplicate });
  g.run({ type: 'hidden17.ritual.resolve' });
  expect(g.s.hidden17!.ritual.choices[first].status).toBe('blocked');
  expect(g.s.hidden17!.ritual.choices[second].status).toBe('active');
  expect(g.s.players.o5.protection).toBeUndefined();
  expect(g.s.items[ward]).toBeTruthy();
  expect(g.s.items[duplicate]).toBeTruthy();
  expect(g.s.items[duplicate].reservedFor).toBeUndefined();
});

test('полностью отменённая группа не расходует защиту', () => {
  const g = new G();
  const salt = g.prep('o1', 'salt');
  g.s.players.o5.protection = { by: 'o5', source: 'ability' };
  g.choices();
  g.as('o1', { type: 'hidden17.ritual.choice', kind: 'salt', itemId: salt, targetId: g.shard('I').id });
  g.run({ type: 'hidden17.ritual.reveal' });
  const id = Object.keys(g.s.hidden17!.ritual.choices)[0];
  g.as('o5', { type: 'hidden17.ritual.ward', against: id });
  g.as('o1', { type: 'hidden17.ritual.cancel', id });
  g.run({ type: 'hidden17.ritual.resolve' });
  expect(g.s.players.o5.protection).toBeTruthy();
});

test.each(['none', 'decline', 'move', 'hide'])('линза определяет компонент только с актуальным согласием: %s', change => {
  const g = new G();
  const component = g.prep('o1', 'salt'), lens = g.item('o6', 'special', 'inspection-lens');
  const cmd: Command = { type: 'hidden17.signature.use', itemId: lens, targets: ['o1'], relicId: component, question: 'effect' };
  expect(g.try(cmd, player('o6')).ok).toBe(false);
  g.as('o1', { type: 'hidden17.present', itemId: component, player: 'o6', allow: true });
  g.as('o6', cmd);
  const id = Object.keys(g.s.hidden17!.uses)[0];
  if (change === 'move')
    g.run({ type: 'gm.correct', playerKey: 'o1', change: { field: 'itemOwner', itemId: component, owner: { type: 'player', key: 'o2' } }, reason: 'Передача' });
  if (change === 'hide')
    g.as('o1', { type: 'hidden17.present', itemId: component, player: 'o6', allow: false });
  const result = g.try({ type: 'hidden17.signature.respond', id, accept: change !== 'decline' }, player('o1'));
  if (change === 'none') {
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.state.hidden17!.uses[id]).toMatchObject({ status: 'completed', answer: expect.stringContaining('соль') });
  }
  else {
    if (result.ok)
      g.s = result.state;
    expect(g.pv('o6').hidden17!.uses[0].answer).toBeUndefined();
  }
});

test('благовоние снимает оба эффекта у двух согласившихся', () => {
  const g = new G();
  for (const k of ['o1', 'o2']) {
    g.s.players[k].curse = true;
    g.s.players[k].thorns = true;
  }
  g.as('o8', { type: 'hidden17.signature.use', itemId: g.item('o8', 'special', 'herbal-incense'), targets: ['o1', 'o2'] });
  const id = Object.keys(g.s.hidden17!.uses)[0];
  g.as('o1', { type: 'hidden17.signature.respond', id, accept: true });
  expect(g.s.players.o1.curse).toBe(true);
  g.as('o2', { type: 'hidden17.signature.respond', id, accept: true });
  for (const k of ['o1', 'o2']) {
    expect(g.s.players[k].curse).toBe(false);
    expect(g.s.players[k].thorns).toBe(false);
  }
});

test('образ сохраняется без закрепителя, новый закрепитель недоступен', () => {
  const g = new G();
  g.as('o15', { type: 'item.use', itemId: g.item('o15', 'shape', 'shape'), guise: 'Человек' });
  g.run({ type: 'fair.refresh' });
  expect(g.s.players.o15.guise?.name).toBe('Человек');
  expect(g.s.hidden17!.fixedGuise.o15).toBeUndefined();
  g.s.players.o15.ingredients = { ash: 20, moon: 20, dew: 20 };
  g.s.players.o15.gold = 20;
  expect(g.try({ type: 'hidden17.signature.craft', recipeId: 'shape-fixative' }, player('o15')).ok).toBe(false);
});

test('большая помощь после awake один раз с получателем и пояснением', () => {
  const g = new G();
  const cmd: Command = { type: 'fair.help.resolve', effect: 'seed', beneficiary: 'o2', mode: 'free', note: 'Брам передал семя.' };
  expect(g.try(cmd).ok).toBe(false);
  g.outcome();
  expect(g.try({ ...cmd, note: '' }).ok).toBe(false);
  expect(g.try({ ...cmd, beneficiary: 'unknown' }).ok).toBe(false);
  expect(g.try({ ...cmd, mode: 'command' }).ok).toBe(false);
  expect(g.try(cmd, player('o2')).ok).toBe(false);
  g.run(cmd);
  expect(g.try(cmd).ok).toBe(false);
  expect(g.pv('o2').hidden17!.fair!.help).toMatchObject({ effect: 'seed', beneficiary: 'o2', mode: 'free' });
});

test('приказ принадлежит присутствующему донору, держатель не заменяет его', () => {
  const g = new G();
  g.outcome('controlled');
  const cmd: Command = { type: 'fair.help.resolve', effect: 'fort', beneficiary: 'o9', mode: 'command', note: 'Донор произнёс приказ.' };
  expect(g.try({ ...cmd, mode: 'free' }).ok).toBe(false);
  g.run({ type: 'player.setPresent', roleKey: 'o5', present: false });
  expect(g.try(cmd).ok).toBe(false);
  g.run({ type: 'player.setPresent', roleKey: 'o5', present: true });
  g.run(cmd);
  expect(g.try(cmd).ok).toBe(false);
});

test.each(['seed', 'focus', 'spring'] as const)('порция %s расходуется один раз, только focus создаёт Фокус', effect => {
  const g = new G();
  g.outcome();
  const before = Object.values(g.s.items).filter(i => i.kind === 'focus').length;
  g.run({ type: 'fair.portion.resolve', owner: 'o6', effect, note: 'Владелец согласился.' });
  expect(Object.values(g.s.items).filter(i => i.kind === 'focus')).toHaveLength(before + (effect === 'focus' ? 1 : 0));
  expect(g.try({ type: 'fair.portion.resolve', owner: 'o6', effect, note: 'Повтор' }).ok).toBe(false);
  expect(g.pv('o6').hidden17!.fair!.portions?.o6.effect).toBe(effect);
});

test('слабая порция и сон не дают малую помощь', () => {
  const g = new G();
  g.outcome();
  g.s.hidden17!.ritual.outcome!.vessels.o6 = 'weak';
  const cmd: Command = { type: 'fair.portion.resolve', owner: 'o6', effect: 'focus', note: 'Попытка' };
  expect(g.try(cmd).ok).toBe(false);
  g.s.hidden17!.ritual.outcome!.vessels.o6 = 'full';
  g.s.hidden17!.ritual.outcome!.life = 'sleep';
  expect(g.try(cmd).ok).toBe(false);
});

test('линза сразу распознаёт свой компонент без второго согласия', () => {
  const g = new G();
  const component = g.prep('o6', 'vessel');
  g.as('o6', { type: 'hidden17.signature.use', itemId: g.item('o6', 'special', 'inspection-lens'), targets: ['o6'], relicId: component, question: 'effect' });
  expect(Object.values(g.s.hidden17!.uses)[0]).toMatchObject({ status: 'completed', answer: expect.stringContaining('Сосуд') });
});

test('сохранённый закрепитель работает, даже когда удалён из нового каталога', () => {
  const c = { ...content, hidden17: { ...content.hidden17!, signatureGoods: content.hidden17!.signatureGoods.filter(g => g.id !== 'shape-fixative') } };
  const g = new G(c);
  g.as('o15', { type: 'item.use', itemId: g.item('o15', 'shape', 'shape'), guise: 'Человек' });
  g.as('o15', { type: 'hidden17.signature.use', itemId: g.item('o15', 'special', 'shape-fixative'), targets: ['o15'] });
  expect(g.s.hidden17!.fixedGuise.o15).toBe('Человек');
});

test('отмена заявки и перенос прибытия в будущее освобождают подготовку', () => {
  for (const cause of ['cancel', 'later']) {
    const g = new G();
    g.ready();
    const id = g.s.hidden17!.fair!.admissions.o5.requestId;
    if (cause === 'cancel')
      g.as('o5', { type: 'story.cancel', id, revision: g.s.story!.requests[id].revision });
    else
      g.run({ type: 'fair.admit', player: 'o5', requestId: id, at: g.now + 10000 });
    expect(g.shard('II').reservedFor).toBeUndefined();
    expect(g.s.hidden17!.ritual.circle).not.toContain(g.shard('II').id);
  }
});

test('предварительные резервы защищены от сделки, возвращаются при отзыве и завершении без обряда', () => {
  const g = new G();
  g.ready();
  const id = g.shard('I').id;
  expect(g.try({ type: 'narrative.trade.create', to: 'o2', give: bundle({ items: [id] }), wish: '' }, player('o1')).ok).toBe(false);
  g.as('o1', { type: 'hidden17.ritual.offer', itemId: id, include: false });
  expect(g.s.items[id].reservedFor).toBeUndefined();
  g.run({ type: 'fair.finish' });
  expect(Object.values(g.s.items).some(i => i.reservedFor === 'hidden17:ritual')).toBe(false);
});

test('пульт получает readiness, игрок — только свои резервы и публичное предупреждение', () => {
  const g = new G();
  g.ready();
  g.run({ type: 'fair.ritual.announce' });
  let v = viewFor(g.s, content, gm, g.now);
  if (v.kind !== 'gm')
    throw Error('gm');
  expect(v.finalRitualReadiness).toMatchObject({ ready: false, shards: 3, focuses: 2 });
  g.now += 300000;
  v = viewFor(g.s, content, gm, g.now);
  if (v.kind !== 'gm')
    throw Error('gm');
  expect(v.finalRitualReadiness?.ready).toBe(true);
  const pv = g.pv('o2');
  expect(pv.hidden17!.fair!.ritualAnnouncement?.deadline).toBe(301000);
  for (const id of [...g.s.hidden17!.ritual.circle, ...g.s.hidden17!.ritual.focuses])
    expect(pv.hidden17!.knownItems[id]).toBeUndefined();
  expect(pv).not.toHaveProperty('finalRitualReadiness');
});

test('проекция своей защиты сохраняет выбор источника для UI', () => {
  const g = new G();
  const salt = g.prep('o1', 'salt');
  g.s.players.o5.protection = { by: 'o5', source: 'ability' };
  g.choices();
  g.as('o1', { type: 'hidden17.ritual.choice', kind: 'salt', itemId: salt, targetId: g.shard('I').id });
  g.run({ type: 'hidden17.ritual.reveal' });
  const against = Object.keys(g.s.hidden17!.ritual.choices)[0];
  g.as('o5', { type: 'hidden17.ritual.ward', against });
  expect(g.pv('o5').hidden17!.ritual.myWard).toEqual({ against, source: 'protection' });
  expect(g.pv('o6').hidden17!.ritual.myWard).toBeUndefined();
});

test.each([['o1', { kind: 'payAshWithGold', recipeId: 'cleanse' }, 4], ['o6', { kind: 'substituteIngredient', recipeId: 'focus', from: 'moon', to: 'ash' }, 3]] as const)('способность %s сохраняет надбавку NPC', (key, use, price) => {
  const g = new G();
  g.s.players[key].ingredients = { ash: 20, moon: 20, dew: 20 };
  g.as(key, { type: 'ability.use', use });
  expect(g.s.players[key].gold).toBe(8 - price);
});

test('заказ мастеру оплачивает базу и согласованный гонорар, скидка не меняет гонорар', () => {
  const g = new G();
  g.s.players.o2.ingredients = { ash: 20, moon: 20, dew: 20 };
  g.s.players.o2.discount = true;
  g.as('o6', { type: 'hidden17.produce', recipeId: 'shape', customer: 'o2', fee: 3 });
  const p = Object.values(g.s.hidden17!.production)[0];
  expect(p.bankGold).toBe(1);
  g.as('o2', { type: 'hidden17.production.respond', id: p.id, accept: true });
  expect(g.s.players.o2.gold).toBe(4);
  expect(g.s.players.o6.gold).toBe(11);
});

test('порошок перепроверяет присутствие и резерв, расходует два Фокуса только при успехе', () => {
  const g = new G();
  g.ready();
  g.run({ type: 'fair.ritual.announce' });
  g.now += 300000;
  g.run({ type: 'hidden17.ritual.start' });
  const ids = [...g.s.hidden17!.ritual.focuses];
  expect(ids.every(id => !!g.s.items[id])).toBe(true);
  g.run({ type: 'player.setPresent', roleKey: 'o5', present: false });
  const before = structuredClone(g.s);
  expect(g.try({ type: 'hidden17.ritual.powder' }).ok).toBe(false);
  expect(g.s).toEqual(before);
  g.run({ type: 'player.setPresent', roleKey: 'o5', present: true });
  g.run({ type: 'hidden17.ritual.powder' });
  expect(ids.every(id => !g.s.items[id])).toBe(true);
  g.run({ type: 'hidden17.ritual.finish' });
  expect(g.s.hidden17!.ritual.outcome!.life).toBe('sleep');
  expect(g.try({ type: 'hidden17.ritual.start' }).ok).toBe(false);
});

test('пауза, незавершённая сцена и начатые кости запрещают готовый старт', () => {
  for (const reason of ['pause', 'scene', 'dice']) {
    const g = new G();
    g.ready();
    g.run({ type: 'fair.ritual.announce' });
    g.now += 300000;
    if (reason === 'pause')
      g.run({ type: 'clock.pause' });
    if (reason === 'scene')
      g.s.hidden17!.fair!.destruction.pending = { id: 'pending', author: 'o1', targetId: 'unused', ref: 'V', saltId: 'unused', status: 'pending' };
    if (reason === 'dice')
      g.s.hidden17!.dice.started = { id: 'started', from: 'o1', to: 'o2', stake: 0, status: 'started' };
    expect(g.try({ type: 'hidden17.ritual.start' }).ok).toBe(false);
    expect(g.s.hidden17!.ritual.step).toBe('preparation');
  }
});

test('после ухода вкладчика порошок выбирает два оставшихся доступных Фокуса', () => {
  const g = new G();
  g.ready();
  const first = g.s.hidden17!.ritual.focuses[0];
  g.as('o1', { type: 'hidden17.ritual.offer', itemId: first, include: false });
  g.as('o6', { type: 'hidden17.ritual.offer', itemId: g.item('o6', 'focus'), include: true });
  g.as('o1', { type: 'hidden17.ritual.offer', itemId: g.item('o1', 'focus'), include: true });
  g.as('o1', { type: 'hidden17.ritual.offer', itemId: g.item('o1', 'focus'), include: true });
  g.run({ type: 'fair.ritual.announce' });
  g.now += 300000;
  g.run({ type: 'hidden17.ritual.start' });
  g.run({ type: 'player.setPresent', roleKey: 'o6', present: false });
  g.run({ type: 'hidden17.ritual.powder' });
  expect(g.s.hidden17!.ritual.step).toBe('powder');
  expect(Object.values(g.s.items).find(i => i.kind === 'focus' && i.owner.type === 'player' && i.owner.key === 'o6')?.reservedFor).toBeUndefined();
});
