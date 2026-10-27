import { readFileSync } from 'node:fs';
import { loadContent } from '../content';
import { defaultContentPath } from '../node';
import type { AbilityUse, Actor, Command, Correction } from '../commands';
import type { Event } from '../events';
import type { AltarSide, Bundle, Counts, GameState, Item } from '../types';
import { execute, initialState } from '../engine';

export const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

export const gm: Actor = { type: 'gm' };
export const system: Actor = { type: 'system' };
export const player = (key: string): Actor => ({ type: 'player', roleKey: key });

// Сквозной счётчик id: 'id1', 'id2', … — уникальны в пределах тестового файла.
let idCounter = 0;
const newId = () => `id${++idCounter}`;

/** Коды приглашений вида code-<roleKey> для всех ролей и code-gm для ведущего. */
export function testCodes(): Record<string, string> {
  const codes: Record<string, string> = { gm: 'code-gm' };
  for (const r of content.roles) codes[r.key] = `code-${r.key}`;
  return codes;
}

/** Свежая сессия в фазе setup, состав ещё не задан. */
export function newGame(): GameState {
  return initialState(content, testCodes());
}

export function run(state: GameState, cmd: Command, actor: Actor, now = 0) {
  return execute(state, content, cmd, { now, actor, newId, random: () => 0.5 });
}

function must(state: GameState, cmd: Command, actor: Actor, log?: Event[]): GameState {
  const r = run(state, cmd, actor);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  log?.push(...r.events);
  return r.state;
}

/**
 * Состав N, привязка всех ролей (telegramId = 1000 + pos), явка (по умолчанию все), открытие.
 * log: сюда складываются события подготовки, чтобы проиграть журнал с newGame().
 */
export function makeGame(n: number, opts: { present?: string[]; log?: Event[] } = {}): GameState {
  const { log } = opts;
  let s = must(newGame(), { type: 'session.setN', n }, gm, log);
  const present = new Set(opts.present ?? s.roster);
  for (const key of s.roster) {
    s = must(s, { type: 'player.bind', code: `code-${key}`, telegramId: 1000 + content.roleByKey[key].pos }, system, log);
    if (present.has(key)) s = must(s, { type: 'player.setPresent', roleKey: key, present: true }, gm, log);
  }
  return must(s, { type: 'session.open' }, gm, log);
}

/** Все роли состава N, кроме перечисленных. */
export function allBut(n: number, absent: string[]): string[] {
  return must(newGame(), { type: 'session.setN', n }, gm).roster.filter(k => !absent.includes(k));
}

export { checkInvariants, checkActStart, checkGold } from '../invariants';

const zeroCounts = (): Counts => ({ ash: 0, moon: 0, dew: 0 });
/** Набор для предложения: пустой, поверх него заданные поля. */
export const bundle = (b: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: zeroCounts(), items: [], ...b });

/**
 * Ведомая командами ярмарка для сценариев: каждая команда проходит через движок и должна быть принята.
 * Согласия на способности и вещи сразу даются всеми одобряющими.
 */
export class Fair {
  now = 1000;
  constructor(public s: GameState) {}

  run(cmd: Command, actor: Actor): Event[] {
    this.now += 1000;
    const r = run(this.s, cmd, actor, this.now);
    if (!r.ok) throw new Error(`${cmd.type} от ${actor.type === 'player' ? actor.roleKey : actor.type}: ${r.error} ${r.detail ?? ''}`);
    this.s = r.state;
    return r.events;
  }
  as(key: string, cmd: Command): Event[] { return this.run(cmd, player(key)); }
  correct(key: string, change: Correction): void { this.run({ type: 'gm.correct', playerKey: key, change, reason: 'сценарий теста' }, gm); }
  addGold(key: string, delta: number): void { this.correct(key, { field: 'gold', delta }); }
  addIngredients(key: string, c: Partial<Counts>): void {
    for (const [ingredient, delta] of Object.entries(c)) if (delta) this.correct(key, { field: 'ingredient', ingredient: ingredient as keyof Counts, delta });
  }
  /** Вещи игрока. */
  owned(key: string): Item[] { return Object.values(this.s.items).filter(i => i.owner.type === 'player' && i.owner.key === key); }
  /** Вещь по виду и ref где угодно. */
  find(kind: Item['kind'], ref: string): Item {
    const it = Object.values(this.s.items).find(i => i.kind === kind && i.ref === ref);
    if (!it) throw new Error(`нет вещи ${kind} ${ref}`);
    return it;
  }
  /** Перенос вещи от игрока к игроку исправлением ведущего. */
  moveTo(itemId: string, key: string): void { this.correct(key, { field: 'itemOwner', itemId, owner: { type: 'player', key } }); }
  /** Изготовление по рецепту: недостающие ингредиенты и золото докладывает ведущий. Возвращает id вещи. */
  craft(key: string, recipeId: string): string {
    const recipe = content.recipeById[recipeId];
    this.addIngredients(key, recipe.cost);
    const p = this.s.players[key];
    if (p.gold - p.reservedGold < recipe.gold + 1) this.addGold(key, recipe.gold + 1);
    const e = this.as(key, { type: 'shop.craft', recipeId }).find(x => x.type === 'ItemCrafted');
    if (e?.type !== 'ItemCrafted') throw new Error('нет ItemCrafted');
    return e.item.id;
  }
  /** Все одобряющие запроса из событий соглашаются. */
  private approve(events: Event[]): Event[] {
    const req = events.find(e => e.type === 'ConsentRequested');
    if (req?.type !== 'ConsentRequested') return events;
    const out = [...events];
    for (const by of req.request.approvers) out.push(...this.as(by, { type: 'consent.accept', id: req.request.id }));
    return out;
  }
  ability(key: string, use: AbilityUse): Event[] { return this.approve(this.as(key, { type: 'ability.use', use })); }
  useItem(key: string, itemId: string, target?: string, guise?: string): Event[] {
    return this.approve(this.as(key, { type: 'item.use', itemId, ...(target !== undefined ? { target } : {}), ...(guise !== undefined ? { guise } : {}) }));
  }
  /** Предложение from → to и его принятие. */
  trade(from: string, to: string, give: Partial<Bundle>, get: Partial<Bundle> = {}, service = false): void {
    const e = this.as(from, { type: 'offer.create', to, give: bundle(give), get: bundle(get), service });
    const created = e.find(x => x.type === 'OfferCreated');
    if (created?.type !== 'OfferCreated') throw new Error('нет OfferCreated');
    const done = this.as(to, { type: 'offer.accept', id: created.offer.id });
    if (!done.some(x => x.type === 'OfferAccepted')) throw new Error('сделка не состоялась');
  }
  /** Вклад на алтарь; возвращает id вклада. */
  contribute(key: string, side: AltarSide, what: { itemId: string } | { gold: number }): string {
    const e = this.as(key, { type: 'altar.contribute', side, ...what }).find(x => x.type === 'Contributed');
    if (e?.type !== 'Contributed') throw new Error('нет Contributed');
    return e.contribution.id;
  }
  nextAct(): void { this.run({ type: 'act.next' }, gm); }
  /** Лот текущего акта уходит игроку закрытой ставкой в 1 золото. */
  winLot(key: string, act: 2 | 3): void {
    const lot = Object.values(this.s.lots).find(l => l.act === act && l.status === 'announced');
    if (!lot) throw new Error(`нет лота акта ${act}`);
    this.run({ type: 'lot.sealedBids', id: lot.id }, gm);
    this.as(key, { type: 'lot.bid', id: lot.id, amount: 1 });
    this.run({ type: 'lot.close', id: lot.id }, gm);
  }
}

/**
 * Собирает алтарь: три осколка и два Фокуса кладёт keeper, золото 2 + 2 + 2 кладут три дарителя.
 * Осколки заранее должны лежать у keeper.
 */
export function buildAltar(f: Fair, side: AltarSide, keeper: string, shardRefs: string[], donors: string[]): void {
  for (const ref of shardRefs) f.contribute(keeper, side, { itemId: f.find('shard', ref).id });
  for (let i = 0; i < 2; i++) f.contribute(keeper, side, { itemId: f.craft(keeper, 'focus') });
  for (const d of donors) f.contribute(d, side, { gold: 2 });
}

/** Состав 12: осколки II и III переезжают к Серафине, она собирает wake. */
export function wakeReady(f: Fair): void {
  f.moveTo(f.find('shard', 'II').id, 'o1');
  f.moveTo(f.find('shard', 'III').id, 'o1');
  buildAltar(f, 'wake', 'o1', ['I', 'II', 'III'], ['o1', 'o2', 'o4']);
}
