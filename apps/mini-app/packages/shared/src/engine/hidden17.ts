import { ABILITY_BY_ROLE } from '../abilities';
import { storyReplacesAbility } from '../story';
import type { Content } from '../content';
import type { AbilityUse, Command, Ctx } from '../commands';
import type { Event } from '../events';
import type { HiddenChoice, HiddenCommand, HiddenMethod, HiddenOutcome, HiddenProduction, HiddenState, HiddenUse } from '../hidden17';
import type { Bundle, GameState, Item, TradeSide } from '../types';
import { available, hasBundle, INGREDIENTS, transfer } from './bundles';
import { emptyPlayer } from './session';
import { craftQuote, recipeOf } from './shop';
import { fail, ok, type ErrorCode, type Result } from './result';
import { goalDone } from './closing';
import { GOALS } from '../goals';

class Invalid extends Error { constructor(public code: ErrorCode, detail: string) { super(detail); } }
function requireThat(value: unknown, detail: string, code: ErrorCode = 'invalid'): asserts value { if (!value) throw new Invalid(code, detail); }
const blank = (): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] });
const act = (s: GameState) => Number(s.phase.slice(-1)) as 1 | 2 | 3;
const ordinary = ['potion', 'ward', 'focus', 'shape'];
const activeBoard = (b: HiddenState['board'][string]) => b.status === 'open' || b.status === 'accepted';
export function newHiddenState(content: Content): HiddenState {
  const learned: HiddenState['learned'] = {};
  for (const key of Object.keys(content.hidden17!.roles)) learned[key] = content.hidden17!.methods.filter(m => ['salt', 'command', 'vessel'].includes(m.id) && m.holders.includes(key)).map(m => m.id === 'command' ? 'sign' : m.id as HiddenMethod);
  return { version: 1, presentations: {}, rumors: [], learned, prepared: {}, board: {}, dice: {}, production: {}, uses: {}, signatureActs: {}, fixedGuise: {}, facts: { truth: false, serafinaOffer: false, veldaRenounced: false }, ritual: { step: 'preparation', circle: [], focuses: [], permissions: {}, formulaSpoken: false, choices: {}, wards: {}, wardItems: {}, extinguished: [], observed: [] } };
}
export function enableHidden(state: GameState, content: Content, at: number): Event {
  const roster = Object.keys(content.hidden17!.roles);
  const players = Object.fromEntries(roster.map(key => [key, state.players[key] ?? { ...emptyPlayer(key), ...(state.bindings[key] ? { telegramId: state.bindings[key] } : {}) }]));
  return { type: 'Hidden17Enabled', at, action: 'enable', patch: { hidden17: newHiddenState(content), roster, players, altars: {} } };
}
function owned(s: GameState, key: string, id: string, free = true): Item {
  const item = s.items[id]; requireThat(item && item.owner.type === 'player' && item.owner.key === key, 'Нужна собственная вещь', 'not_owner');
  requireThat(!free || !item.reservedFor, 'Вещь зарезервирована', 'reserved'); return item;
}
function reserve(s: GameState, key: string, b: Bundle, id: string, direction: 1 | -1) {
  s.players[key].reservedGold += direction * b.gold;
  for (const item of b.items) { if (direction === 1) s.items[item].reservedFor = id; else if (s.items[item]?.reservedFor === id) delete s.items[item].reservedFor; }
}
function checkBundle(s: GameState, key: string, b: Bundle) {
  requireThat(b && typeof b === 'object' && Number.isSafeInteger(b.gold) && b.gold >= 0 && b.ingredients && Array.isArray(b.items), 'Неверная награда');
  for (const k of INGREDIENTS) requireThat(Number.isSafeInteger(b.ingredients[k]) && b.ingredients[k] >= 0, 'Неверное число ингредиентов');
  requireThat(new Set(b.items).size === b.items.length && !b.wants?.length, 'Повтор вещи или запрос вместо награды');
  requireThat(hasBundle(s, key, b), 'Награда уже обещана или недоступна', 'insufficient');
}
function textField(v: unknown, max = 1500): asserts v is string { requireThat(typeof v === 'string' && v.trim().length > 0 && v.length <= max, 'Нужен непустой текст допустимой длины'); }
function settleProduction(s: GameState, content: Content, p: HiddenProduction, ctx: Ctx) {
  requireThat(s.players[p.maker]?.present && s.players[p.customer]?.present, 'Участник отсутствует');
  requireThat(content.hidden17!.crafting.makers[p.maker]?.includes(p.recipeId), 'Это ремесло недоступно', 'forbidden');
  const found = recipeOf(content, p.recipeId); requireThat(found, 'Неизвестный рецепт');
  const maker = s.players[p.maker];
  if (p.ability) {
    requireThat(!storyReplacesAbility(s.story, p.maker, s.phase), 'Основная способность заменена решением ведущего', 'forbidden');
    requireThat(!maker.abilityUsedInAct && !maker.abilityPending, 'Способность уже использована', 'limit');
    requireThat(p.ability === 'focusFree' ? p.maker === 'o5' && p.recipeId === 'focus' : p.maker === 'o6' && !!p.substitute, 'Эта способность недоступна');
  }
  const q = craftQuote(s, p.customer, found.recipe, { freeWork: p.ability === 'focusFree', ...(p.ability === 'substituteIngredient' ? { substitute: p.substitute } : {}) });
  if ('error' in q) throw new Invalid(q.error, q.detail);
  requireThat(q.paidGold === p.bankGold && INGREDIENTS.every(k => (q.paidIngredients[k] ?? 0) === (p.materials[k] ?? 0)), 'Цена изменилась: отмените заказ и согласуйте новый');
  requireThat(available(s, p.customer).gold >= q.paidGold + p.fee, 'Не хватает золота на работу и гонорар', 'insufficient');
  const customer = s.players[p.customer]; customer.gold -= q.paidGold + p.fee; maker.gold += p.fee;
  for (const k of INGREDIENTS) customer.ingredients[k] -= q.paidIngredients[k] ?? 0;
  if (q.clearedDiscount) { customer.discount = false; delete customer.discountBy; }
  if (q.clearedThorns) { customer.thorns = false; delete customer.thornsBy; }
  const id = ctx.newId();
  s.items[id] = { id, kind: found.kind, ref: p.recipeId, owner: { type: 'player', key: p.customer }, createdBy: p.maker };
  s.crafts.push({ at: ctx.now, player: p.maker, kind: found.kind, itemId: id });
  if (p.ability) { maker.abilityUsedInAct = true; s.actions.push({ id: ctx.newId(), at: ctx.now, act: act(s), author: p.maker, source: { type: 'ability', ability: p.ability }, outcome: 'done', hostile: false, effects: [], item: { kind: found.kind, ref: p.recipeId } }); }
  if (p.customer !== p.maker) {
    const give: TradeSide = { ...blank(), items: [{ kind: found.kind, ref: p.recipeId, createdBy: p.maker }] };
    s.trades.push({ id: ctx.newId(), at: ctx.now, from: p.maker, to: p.customer, service: false, give, get: { ...blank(), gold: p.fee, items: [] } });
  }
  p.status = 'completed';
}
function completeUse(s: GameState, u: HiddenUse) {
  const item = owned(s, u.author, u.itemId, false);
  requireThat(item.reservedFor === u.id, 'Резерв изделия потерян');
  if (item.ref === 'inspection-lens') { requireThat(!!u.answer, 'Ведущий ещё не сообщил физический факт'); }
  else if (item.ref === 'shape-fixative') {
    const target = u.targets[0]; requireThat(s.players[target].guise && s.players[target].guise!.name === u.guise, 'Выбранный образ изменился: согласуйте новое применение'); s.hidden17!.fixedGuise[target] = u.guise!;
  } else {
    for (const target of u.targets) {
      const effect = u.effects?.[target]; requireThat(effect && s.players[target][effect], 'Выбранного эффекта уже нет'); s.players[target][effect] = false;
      if (effect === 'thorns') delete s.players[target].thornsBy;
    }
  }
  delete s.items[u.itemId]; u.status = 'completed';
}
function cancelUse(s: GameState, u: HiddenUse) { if (s.items[u.itemId]?.reservedFor === u.id) delete s.items[u.itemId].reservedFor; u.status = 'cancelled'; }
function finalGoals(s: GameState, content: Content): Record<string, [boolean, boolean]> {
  const result: Record<string, [boolean, boolean]> = {};
  for (const key of s.roster) {
    let goals: [boolean, boolean] = [goalDone(s, content, key, GOALS[key][0]), goalDone(s, content, key, GOALS[key][1])];
    if (key === 'o1') goals[1] = s.hidden17!.facts.serafinaOffer;
    if (key === 'o5') goals[1] = s.hidden17!.facts.veldaRenounced || (s.hidden17!.ritual.outcome?.controller === key);
    if (key === 'o11') goals[1] = s.hidden17!.facts.truth;
    if (key === 'o14') {
      const recipients = new Set(s.actions.filter(a => a.author === key && a.source.type === 'ability' && a.source.ability === 'discountOther' && a.outcome === 'done').map(a => a.target));
      const paid = new Set(s.trades.filter(t => t.service && ((t.from === key && t.get.gold >= 1 && recipients.has(t.to)) || (t.to === key && t.give.gold >= 1 && recipients.has(t.from)))).map(t => t.from === key ? t.to : t.from));
      for (const b of Object.values(s.hidden17!.board)) if (b.status === 'completed' && b.worker === key && b.reward.gold >= 1 && recipients.has(b.author)) paid.add(b.author);
      goals[0] = paid.size >= 2;
    }
    if (key === 'o6') {
      goals[0] = new Set(s.crafts.filter(c => c.player === key && ordinary.includes(c.kind)).map(c => c.kind)).size >= 3;
      const buyers = new Set<string>(); let sold = 0;
      for (const t of s.trades) {
        const gave = t.from === key ? t.give : t.to === key ? t.get : undefined;
        const got = t.from === key ? t.get : t.give;
        if (!gave || got.gold < 1) continue;
        const count = gave.items.filter(i => i.createdBy === key && ordinary.includes(i.kind)).length;
        if (count) { sold += count; buyers.add(t.from === key ? t.to : t.from); }
      }
      goals[1] = sold >= 2 && buyers.size >= 2;
    }
    goals = goals.map((v, i) => s.players[key].goalOverrides?.[i] ?? v) as [boolean, boolean]; result[key] = goals;
  }
  return result;
}
export { finalGoals as hiddenGoals };

/** Дополнительные команды: валидация на отдельном снимке гарантирует атомарный отказ. */
export function hiddenDecide(state: GameState, content: Content, command: Command, ctx: Ctx): Result | undefined {
  if (!command.type.startsWith('hidden17.')) return undefined;
  const cmd = command as HiddenCommand;
  try {
    const gm = ctx.actor.type === 'gm';
    for (const flag of ['accept', 'include', 'allow', 'value', 'serviceAbility'] as const) if (flag in cmd) requireThat(typeof (cmd as unknown as Record<string, unknown>)[flag] === 'boolean', 'Ожидается явное согласие или отказ');
    if (cmd.type === 'hidden17.enable') {
      requireThat(gm, 'Только ведущий', 'forbidden'); requireThat(state.phase === 'setup', 'Переход возможен только до открытия', 'phase');
      requireThat(content.hidden17 && Object.keys(content.hidden17.roles).length === 17, 'Сценарий 17 не загружен');
      return state.hidden17 ? ok() : ok(enableHidden(state, content, ctx.now));
    }
    requireThat(state.hidden17 && content.hidden17, 'Новый режим не включён', 'phase');
    const s = structuredClone(state), h = s.hidden17!, r = h.ritual;
    const key = ctx.actor.type === 'player' ? ctx.actor.roleKey : '';
    const player = () => { requireThat(key && s.players[key]?.present && s.roster.includes(key), 'Нужен присутствующий игрок', 'forbidden'); return key; };
    const master = () => requireThat(gm, 'Только ведущий', 'forbidden');
    const before = () => requireThat(['act1', 'act2', 'act3'].includes(s.phase) && r.step === 'preparation', 'Обычные действия остановлены на финал', 'phase');
    const step = (...steps: string[]) => requireThat(steps.includes(r.step), 'Сейчас другое окно обряда', 'phase');
    switch (cmd.type) {
      case 'hidden17.present': { player(); before(); const item = owned(s, key, cmd.itemId, false); requireThat(item.kind === 'relic' && s.players[cmd.player], 'Предъявить можно обычную реликвию'); const list = h.presentations[item.id] ?? []; h.presentations[item.id] = cmd.allow ? [...new Set([...list, cmd.player])] : list.filter(k => k !== cmd.player); break; }
      case 'hidden17.rumor': { player(); before(); textField(cmd.text, 800); requireThat(h.rumors.filter(x => x.author === key).length < 30, 'Лимит слухов', 'limit'); h.rumors.push({ author: key, text: cmd.text, at: ctx.now, unverified: true }); break; }
      case 'hidden17.produce': {
        player(); before(); const customer = cmd.customer ?? key; const fee = cmd.fee ?? 0;
        requireThat(s.players[customer]?.present && Number.isSafeInteger(fee) && fee >= 0 && (customer !== key || fee === 0), 'Неверный клиент или гонорар');
        requireThat(content.hidden17.crafting.makers[key]?.includes(cmd.recipeId), 'Рецепт не входит в профессию', 'forbidden');
        requireThat(!cmd.ability || ['focusFree', 'substituteIngredient'].includes(cmd.ability), 'Неизвестная способность');
        if (cmd.ability) {
          requireThat(!storyReplacesAbility(s.story, key, s.phase) && !s.players[key].abilityUsedInAct && !s.players[key].abilityPending, 'Способность сейчас недоступна', 'limit');
          requireThat(cmd.ability === 'focusFree' ? key === 'o5' && cmd.recipeId === 'focus' : key === 'o6' && !!cmd.substitute, 'Эта способность недоступна');
        }
        const found = recipeOf(content, cmd.recipeId); requireThat(found, 'Неизвестный рецепт');
        const quote = craftQuote(s, customer, found.recipe, { freeWork: cmd.ability === 'focusFree', ...(cmd.ability === 'substituteIngredient' ? { substitute: cmd.substitute } : {}) });
        if ('error' in quote) throw new Invalid(quote.error, quote.detail);
        const id = ctx.newId(); const p: HiddenProduction = { id, maker: key, customer, fee, bankGold: quote.paidGold, materials: quote.paidIngredients, recipeId: cmd.recipeId, status: 'pending', ...(cmd.ability ? { ability: cmd.ability, substitute: cmd.substitute } : {}) };
        h.production[id] = p; if (customer === key) settleProduction(s, content, p, ctx); break;
      }
      case 'hidden17.production.respond': {
        player(); before(); const p = h.production[cmd.id]; requireThat(p?.status === 'pending', 'Заказ уже закрыт');
        requireThat(p.customer === key || (!cmd.accept && p.maker === key), 'Только заказчик подтверждает расходы', 'forbidden');
        if (cmd.accept) settleProduction(s, content, p, ctx); else p.status = 'cancelled'; break;
      }
      case 'hidden17.signature.craft': {
        player(); before(); const recipe = content.hidden17.signatureGoods.find(g => g.id === cmd.recipeId && g.maker === key); requireThat(recipe, 'Авторский рецепт недоступен', 'forbidden');
        requireThat(h.signatureActs[key] !== s.phase, 'Одно авторское изделие за акт', 'limit');
        const cost = { ...blank(), gold: recipe.gold, ingredients: { ...blank().ingredients, ...recipe.cost } }; checkBundle(s, key, cost);
        s.players[key].gold -= cost.gold; for (const k of INGREDIENTS) s.players[key].ingredients[k] -= cost.ingredients[k];
        const id = ctx.newId(); s.items[id] = { id, kind: 'special', ref: recipe.id, createdBy: key, owner: { type: 'player', key } }; h.signatureActs[key] = s.phase; break;
      }
      case 'hidden17.signature.use': {
        player(); before(); const item = owned(s, key, cmd.itemId); requireThat(content.hidden17.signatureGoods.some(g => g.id === item.ref) && item.kind === 'special', 'Нужно авторское изделие');
        requireThat(Array.isArray(cmd.targets) && cmd.targets.length > 0 && new Set(cmd.targets).size === cmd.targets.length && cmd.targets.every(k => s.players[k]?.present), 'Неверные получатели');
        requireThat(cmd.targets.length <= (item.ref === 'herbal-incense' ? 2 : 1), 'Слишком много получателей');
        if (item.ref === 'shape-fixative') requireThat(s.players[cmd.targets[0]].guise && s.actions.some(a => a.source.type === 'item' && a.source.kind === 'shape' && a.target === cmd.targets[0] && a.outcome === 'done'), 'Сначала примените Камень облика');
        if (item.ref === 'inspection-lens') { requireThat(cmd.relicId && ['material', 'compartment'].includes(cmd.question ?? ''), 'Выберите реликвию и физический вопрос'); requireThat(owned(s, cmd.targets[0], cmd.relicId).kind === 'relic', 'Линза только для обычных реликвий'); requireThat(cmd.targets[0] === key || h.presentations[cmd.relicId]?.includes(key), 'Владелец ещё не предъявил реликвию'); }
        if (item.ref === 'herbal-incense') for (const k of cmd.targets) requireThat(['curse', 'thorns'].includes(cmd.effects?.[k] ?? '') && s.players[k][cmd.effects![k]], 'Выберите один текущий эффект для каждого');
        const id = ctx.newId(); h.uses[id] = { id, author: key, itemId: cmd.itemId, ref: item.ref, ...(item.ref === 'shape-fixative' ? { guise: s.players[cmd.targets[0]].guise!.name } : {}), targets: cmd.targets, approved: cmd.targets.includes(key) ? [key] : [], status: 'pending', relicId: cmd.relicId, question: cmd.question, effects: cmd.effects };
        item.reservedFor = id; if (h.uses[id].approved.length === cmd.targets.length && item.ref !== 'inspection-lens') completeUse(s, h.uses[id]); break;
      }
      case 'hidden17.signature.respond': {
        player(); before(); const u = h.uses[cmd.id]; requireThat(u?.status === 'pending' && u.targets.includes(key), 'Запрос недоступен');
        if (!cmd.accept) cancelUse(s, u); else { if (!u.approved.includes(key)) u.approved.push(key); if (u.approved.length === u.targets.length && (s.items[u.itemId].ref !== 'inspection-lens' || u.answer)) completeUse(s, u); } break;
      }
      case 'hidden17.signature.resolve': {
        master(); before(); const u = h.uses[cmd.id]; requireThat(u?.status === 'pending' && s.items[u.itemId]?.ref === 'inspection-lens', 'Это не запрос линзы');
        textField(cmd.answer); requireThat(u.approved.length === u.targets.length, 'Владелец ещё не предъявил реликвию');
        requireThat(u.relicId && owned(s, u.targets[0], u.relicId).kind === 'relic', 'Реликвия больше не предъявлена'); u.answer = cmd.answer; completeUse(s, u); break;
      }
      case 'hidden17.board.create': {
        player(); before(); textField(cmd.title, 120); textField(cmd.condition); textField(cmd.verification); if (cmd.service) textField(cmd.service);
        if (cmd.serviceAbility) {
          requireThat(cmd.service?.trim(), 'Запишите обещанную услугу');
          requireThat(['cleanseOther', 'discountOther', 'protectOther'].includes(ABILITY_BY_ROLE[key]), 'В резерв можно обещать только очищение, скидку или защиту другого игрока', 'forbidden');
          requireThat(!s.players[key].abilityUsedInAct && !s.players[key].abilityPending && !storyReplacesAbility(s.story, key, s.phase), 'Способность сейчас недоступна', 'limit');
          requireThat(!Object.values(h.board).some(b => b.author === key && b.serviceAbility && activeBoard(b)), 'Способность уже обещана в другом заказе', 'reserved');
        }
        requireThat(Number.isSafeInteger(cmd.expiresAt) && cmd.expiresAt > ctx.now, 'Срок должен быть в будущем'); checkBundle(s, key, cmd.reward);
        requireThat(cmd.reward.gold || cmd.reward.items.length || INGREDIENTS.some(k => cmd.reward.ingredients[k]) || cmd.service, 'Укажите награду');
        const id = ctx.newId(); h.board[id] = { id, createdAt: ctx.now, createdActionCount: s.actions.length, ...(cmd.serviceAbility ? { serviceAbility: true } : {}), author: key, title: cmd.title, condition: cmd.condition, verification: cmd.verification, reward: structuredClone(cmd.reward), rewardItems: Object.fromEntries(cmd.reward.items.map(id => [id, { kind: s.items[id].kind, ref: s.items[id].ref }])), service: cmd.service, expiresAt: cmd.expiresAt, status: 'open', cancelApproved: [] };
        reserve(s, key, cmd.reward, id, 1); break;
      }
      case 'hidden17.board.accept': {
        player(); before(); const b = h.board[cmd.id]; requireThat(b?.status === 'open' && b.expiresAt > ctx.now && b.author !== key && s.players[b.author]?.present, 'Заказ недоступен'); b.worker = key; b.status = 'accepted'; break;
      }
      case 'hidden17.board.complete': {
        master(); before(); const b = h.board[cmd.id]; requireThat(b?.status === 'accepted' && b.worker && b.expiresAt >= ctx.now, 'Заказ не принят или просрочен');
        if (b.serviceAbility) requireThat(s.actions.slice(b.createdActionCount ?? 0).some(a => a.at >= b.createdAt && a.author === b.author && a.target === b.worker && a.outcome === 'done' && a.source.type === 'ability' && a.source.ability === ABILITY_BY_ROLE[b.author] && !a.source.copied), 'Обещанная способность ещё не применена к исполнителю с нужным согласием');
        reserve(s, b.author, b.reward, b.id, -1); b.status = 'completed';
        const next = transfer(s, b.author, b.worker, b.reward); s.players = next.players; s.items = next.items; break;
      }
      case 'hidden17.board.cancel': case 'hidden17.board.expire': {
        const b = h.board[cmd.id]; requireThat(b && activeBoard(b), 'Заказ закрыт');
        if (cmd.type === 'hidden17.board.expire') requireThat(ctx.now >= b.expiresAt, 'Срок ещё не истёк');
        else if (!gm) { player(); requireThat(key === b.author || key === b.worker, 'Только стороны', 'forbidden'); if (b.status === 'accepted') { if (!b.cancelApproved.includes(key)) b.cancelApproved.push(key); if (!b.cancelApproved.includes(b.author) || !b.cancelApproved.includes(b.worker!)) break; } }
        reserve(s, b.author, b.reward, b.id, -1); b.status = cmd.type === 'hidden17.board.expire' ? 'expired' : 'cancelled'; break;
      }
      case 'hidden17.dice.invite': {
        player(); before(); requireThat(cmd.to !== key && s.players[cmd.to]?.present && [0, 1].includes(cmd.stake), 'Нужен другой игрок и ставка 0 или 1');
        requireThat(available(s, key).gold >= cmd.stake, 'Нет свободной монеты', 'insufficient'); const id = ctx.newId(); h.dice[id] = { id, from: key, to: cmd.to, stake: cmd.stake, status: 'pending' }; s.players[key].reservedGold += cmd.stake; break;
      }
      case 'hidden17.dice.accept': {
        player(); before(); const d = h.dice[cmd.id]; requireThat(d?.status === 'pending' && d.to === key && s.players[d.from]?.present, 'Приглашение недоступно'); requireThat(available(s, key).gold >= d.stake, 'Нет свободной монеты', 'insufficient'); s.players[key].reservedGold += d.stake; d.status = 'accepted'; break;
      }
      case 'hidden17.dice.cancel': {
        const d = h.dice[cmd.id]; requireThat(d && ['pending', 'accepted'].includes(d.status), 'Броски уже начались'); requireThat(gm || key === d.from || key === d.to, 'Только участники', 'forbidden'); s.players[d.from].reservedGold -= d.stake; if (d.status === 'accepted') s.players[d.to].reservedGold -= d.stake; d.status = 'cancelled'; break;
      }
      case 'hidden17.dice.start': { master(); before(); const d = h.dice[cmd.id]; requireThat(d?.status === 'accepted', 'Нет согласия двух игроков'); d.status = 'started'; break; }
      case 'hidden17.dice.resolve': {
        master(); before(); const d = h.dice[cmd.id]; requireThat(d && ['accepted', 'started'].includes(d.status), 'Раунд не готов'); requireThat(Array.isArray(cmd.rolls) && cmd.rolls.length === 2 && cmd.rolls.every(n => Number.isInteger(n) && n >= 1 && n <= 6), 'Нужны два результата d6');
        for (const k of [d.from, d.to]) s.players[k].reservedGold -= d.stake;
        const direction = Math.sign(cmd.rolls[0] - cmd.rolls[1]); s.players[d.from].gold += direction * d.stake; s.players[d.to].gold -= direction * d.stake; d.rolls = cmd.rolls; d.status = 'completed'; break;
      }
      case 'hidden17.learn': { master(); before(); requireThat(s.roster.includes(cmd.player) && ['salt', 'sign', 'vessel'].includes(cmd.method), 'Неверная роль или способ'); if (!h.learned[cmd.player].includes(cmd.method)) h.learned[cmd.player].push(cmd.method); break; }
      case 'hidden17.prepare': {
        player(); before(); requireThat(h.learned[key]?.includes(cmd.method), 'Способ ещё не изучен', 'forbidden'); const item = owned(s, key, cmd.itemId); requireThat(item.kind === (cmd.method === 'sign' ? 'focus' : 'potion'), 'Неверный компонент');
        if (cmd.method === 'sign') requireThat(cmd.controller && s.roster.includes(cmd.controller) && ['leave', 'stay', 'restore'].includes(cmd.order ?? ''), 'Запишите управляющего и одно распоряжение');
        delete s.items[item.id]; const id = ctx.newId(); s.items[id] = { id, kind: 'special', ref: cmd.method, owner: { type: 'player', key } }; h.prepared[id] = { method: cmd.method, ...(cmd.method === 'sign' ? { controller: cmd.controller, order: cmd.order } : {}) }; break;
      }
      case 'hidden17.ritual.start': {
        master(); before(); requireThat(s.phase === 'act3', 'Финал начинается в III акте', 'phase');
        requireThat(!Object.values(h.dice).some(d => d.status === 'started'), 'Сначала закончите начатые броски');
        for (const b of Object.values(h.board)) if (activeBoard(b)) { reserve(s, b.author, b.reward, b.id, -1); b.status = 'expired'; }
        for (const d of Object.values(h.dice)) if (['pending', 'accepted'].includes(d.status)) { s.players[d.from].reservedGold -= d.stake; if (d.status === 'accepted') s.players[d.to].reservedGold -= d.stake; d.status = 'cancelled'; }
        for (const p of Object.values(h.production)) if (p.status === 'pending') p.status = 'cancelled';
        for (const u of Object.values(h.uses)) if (u.status === 'pending') cancelUse(s, u);
        for (const o of Object.values(s.offers)) if (o.status === 'pending') { reserve(s, o.from, o.give, o.id, -1); o.status = 'expired'; }
        for (const q of Object.values(s.requests)) if (q.status === 'pending') { q.status = 'expired'; q.closedAt = ctx.now; q.reason = 'closed'; if (s.players[q.author].abilityPending === q.id) delete s.players[q.author].abilityPending; for (const i of Object.values(s.items)) if (i.reservedFor === q.id) delete i.reservedFor; }
        for (const l of Object.values(s.lots)) { for (const b of l.bids) { if (['openBidding', 'sealedBidding'].includes(l.status)) s.players[b.player].reservedGold -= b.amount; } if (['openBidding', 'sealedBidding', 'announced', 'fixedPrice'].includes(l.status)) l.status = 'unsold'; }
        r.step = 'assembly'; break;
      }
      case 'hidden17.ritual.offer': {
        player(); step('preparation', 'assembly', 'last-choice'); requireThat(['act1','act2','act3'].includes(s.phase), 'Ярмарка ещё не открыта');
        const item = owned(s, key, cmd.itemId, false); const ownReserve = item.reservedFor === 'hidden17:ritual'; requireThat(!item.reservedFor || ownReserve, 'Вещь зарезервирована', 'reserved');
        requireThat(item.kind === 'shard' || (item.kind === 'focus' && r.step !== 'last-choice'), 'Нужна целая часть или Фокус'); requireThat(!r.extinguished.includes(item.ref), 'Часть погашена');
        const list = item.kind === 'shard' ? r.circle : r.focuses;
        if (cmd.include) { if (!list.includes(item.id)) list.push(item.id); item.reservedFor = 'hidden17:ritual'; }
        else { const index = list.indexOf(item.id); if (index >= 0) list.splice(index, 1); if (ownReserve) delete item.reservedFor; } break;
      }
      case 'hidden17.ritual.permission': {
        player(); step('preparation', 'assembly', 'powder', 'choices'); const item = owned(s, key, cmd.itemId, false); requireThat(item.kind === 'shard' && s.players[cmd.player], 'Нужна часть и участник');
        const list = r.permissions[item.id] ?? []; r.permissions[item.id] = cmd.allow ? [...new Set([...list, cmd.player])] : list.filter(k => k !== cmd.player); break;
      }
      case 'hidden17.ritual.powder': {
        master(); step('assembly'); const shards = r.circle.map(id => s.items[id]).filter(i => i?.kind === 'shard' && !r.extinguished.includes(i.ref) && i.owner.type === 'player' && s.players[i.owner.key]?.present);
        requireThat(new Set(shards.map(i => i.ref)).size >= 3 && r.focuses.length >= 2, 'Нужны три разные целые части и два Фокуса');
        for (const id of r.focuses.slice(0, 2)) { const i = s.items[id]; requireThat(i?.kind === 'focus' && i.reservedFor === 'hidden17:ritual' && i.owner.type === 'player' && s.players[i.owner.key]?.present, 'Фокус недоступен'); delete s.items[id]; }
        for (const id of r.focuses.slice(2)) delete s.items[id].reservedFor; r.focuses = []; r.step = 'powder'; break;
      }
      case 'hidden17.ritual.formula': { player(); step('powder'); requireThat(cmd.text.trim() === content.hidden17.ritual.formula, 'Прочтите формулу с надписи'); r.formulaSpoken = true; r.step = 'choices'; break; }
      case 'hidden17.ritual.choice': {
        player(); step('choices'); requireThat(!r.choices[key], 'Один основной выбор на участника', 'limit');
        requireThat(['salt', 'sign', 'vessel', 'withdraw', 'pass'].includes(cmd.kind), 'Неверный выбор');
        const choice: HiddenChoice = { player: key, kind: cmd.kind, status: 'hidden' };
        if (cmd.kind === 'withdraw') { requireThat(cmd.shardIds?.length && new Set(cmd.shardIds).size === cmd.shardIds.length, 'Укажите свои части'); for (const id of cmd.shardIds) { requireThat(owned(s, key, id, false).kind === 'shard' && r.circle.includes(id), 'В круге нет этой части'); } choice.shardIds = cmd.shardIds; }
        else if (cmd.kind !== 'pass') {
          requireThat(cmd.itemId, 'Нужен подготовленный компонент'); const item = owned(s, key, cmd.itemId); const prepared = h.prepared[item.id]; requireThat(prepared?.method === cmd.kind, 'Неверный подготовленный компонент');
          choice.itemId = item.id; item.reservedFor = 'hidden17:choice';
          if (cmd.kind === 'salt') { const target = s.items[cmd.targetId ?? '']; requireThat(target?.kind === 'shard' && !r.extinguished.includes(target.ref), 'Нужна целая часть'); requireThat(r.circle.includes(target.id) || (target.owner.type === 'player' && target.owner.key === key) || r.permissions[target.id]?.includes(key), 'Чужая часть вне круга недоступна', 'forbidden'); choice.targetId = target.id; }
          if (cmd.kind === 'sign') { choice.controller = prepared.controller; choice.order = prepared.order; }
        }
        r.choices[key] = choice; break;
      }
      case 'hidden17.ritual.reveal': {
        master(); step('choices');
        for (const c of Object.values(r.choices)) if (c.kind === 'withdraw') { for (const id of c.shardIds ?? []) { r.circle = r.circle.filter(i => i !== id); if (s.items[id]?.reservedFor === 'hidden17:ritual') delete s.items[id].reservedFor; } c.status = 'active'; }
        for (const c of Object.values(r.choices)) {
          if (c.kind === 'withdraw' || c.kind === 'pass') continue;
          const target = s.items[c.targetId ?? ''];
          const accessible = c.kind !== 'salt' || (target && (r.circle.includes(target.id) || (target.owner.type === 'player' && target.owner.key === c.player) || r.permissions[target.id]?.includes(c.player)));
          if (!accessible) { c.status = 'invalid'; if (c.itemId && s.items[c.itemId]) delete s.items[c.itemId].reservedFor; continue; }
          c.status = 'active'; if (c.itemId) delete s.items[c.itemId];
          r.observed.push(c.kind === 'salt' ? `Часть ${target!.ref} темнеет.` : c.kind === 'sign' ? 'От сердца тянется нить к управляющему знаку.' : 'В сосуд стекает тонкая струя света.');
        }
        r.step = 'responses'; break;
      }
      case 'hidden17.ritual.cancel': {
        player(); step('responses'); const c = r.choices[key]; requireThat(c?.status === 'active' && ['salt','sign','vessel'].includes(c.kind), 'Нет своей раскрытой попытки'); c.status = 'cancelled'; break;
      }
      case 'hidden17.ritual.ward': {
        player(); step('responses'); const c = r.choices[cmd.against]; requireThat(c?.status === 'active' && ['salt','sign','vessel'].includes(c.kind), 'Щит не отменяет отзыв или уже отменённую попытку');
        const ward = owned(s, key, cmd.itemId, false); requireThat(ward.kind === 'ward' && (!ward.reservedFor || (ward.reservedFor === 'hidden17:ward' && r.wardItems[key] === ward.id)), 'Нужен свой свободный талисман', 'reserved');
        const old = r.wardItems[key]; if (old && s.items[old]) delete s.items[old].reservedFor;
        ward.reservedFor = 'hidden17:ward'; r.wards[key] = cmd.against; r.wardItems[key] = ward.id; break;
      }
      case 'hidden17.ritual.resolve': {
        master(); step('responses');
        const targets = [...new Set(Object.values(r.wards))]; const spent: Record<string, string> = {};
        for (const target of targets) {
          const c = r.choices[target]; if (c?.status !== 'active') continue;
          const defenders = Object.keys(r.wards).filter(k => r.wards[k] === target && s.players[k]?.present && s.items[r.wardItems[k]]?.reservedFor === 'hidden17:ward').sort();
          if (!defenders.length) continue;
          const chosen = defenders[Math.min(defenders.length - 1, Math.floor(Math.max(0, ctx.random()) * defenders.length))];
          delete s.items[r.wardItems[chosen]]; c.status = 'blocked'; spent[chosen] = target;
        }
        for (const id of Object.values(r.wardItems)) if (s.items[id]?.reservedFor === 'hidden17:ward') delete s.items[id].reservedFor;
        r.wards = spent; r.wardItems = {};
        for (const c of Object.values(r.choices)) if (c.kind === 'salt' && c.status === 'active') { const target = s.items[c.targetId!]; if (target && !r.extinguished.includes(target.ref)) r.extinguished.push(target.ref); }
        r.circle = r.circle.filter(id => !r.extinguished.includes(s.items[id]?.ref)); r.step = 'last-choice'; break;
      }
      case 'hidden17.ritual.order': {
        step('last-choice');
        const signs = Object.values(r.choices).filter(c => c.kind === 'sign' && c.status === 'active' && s.players[c.controller!]?.present);
        const names = [...new Set(signs.map(c => c.controller!))];
        requireThat(names.length === 1 && (gm || (player() === names[0])), 'Распоряжение выбирает единственный управляющий или ведущий', 'forbidden');
        requireThat(signs.some(c => c.order === cmd.order), 'Можно выбрать только заранее записанное распоряжение');
        r.orderSelected = cmd.order; r.orderController = names[0]; break;
      }
      case 'hidden17.ritual.finish': {
        master(); step('assembly', 'powder', 'last-choice');
        const life = r.extinguished.length >= 3 ? 'destroyed' : r.formulaSpoken && new Set(r.circle.map(id => s.items[id]).filter(i => i?.kind === 'shard' && !r.extinguished.includes(i.ref) && i.owner.type === 'player' && s.players[i.owner.key]?.present).map(i => i.ref)).size >= 3 ? 'awake' : 'sleep';
        const signs = Object.values(r.choices).filter(c => c.kind === 'sign' && c.status === 'active' && s.players[c.controller!]?.present);
        const controllers = [...new Set(signs.map(c => c.controller!))]; const controlled = life === 'awake' && controllers.length === 1;
        const orders = [...new Set(signs.map(c => c.order!))];
        const order = r.orderController === controllers[0] && orders.includes(r.orderSelected!) ? r.orderSelected : orders.length === 1 ? orders[0] : undefined;
        requireThat(!controlled || order, 'Управляющий или ведущий должен выбрать одно из заранее записанных распоряжений');
        const vessels = Object.values(r.choices).filter(c => c.kind === 'vessel' && c.status === 'active'); const portion = life !== 'awake' ? 'empty' : vessels.length === 1 ? 'full' : 'weak';
        const outcome: HiddenOutcome = { life, freedom: controlled ? 'controlled' : 'free', ...(controlled ? { controller: controllers[0], order } : {}), power: life !== 'awake' ? 'empty' : vessels.length === 0 ? 'whole' : portion, vessels: Object.fromEntries(vessels.map(c => [c.player, portion])), goals: {} };
        r.outcome = outcome; outcome.goals = finalGoals(s, content); r.step = 'finished'; for (const i of Object.values(s.items)) if (i.reservedFor === 'hidden17:ritual') delete i.reservedFor; break;
      }
      case 'hidden17.fact': { master(); requireThat(['truth','serafinaOffer','veldaRenounced'].includes(cmd.fact) && typeof cmd.value === 'boolean', 'Неверная отметка'); h.facts[cmd.fact] = cmd.value; if (r.outcome) r.outcome.goals = finalGoals(s, content); break; }
      default: throw new Invalid('invalid', 'Неизвестная команда скрытых намерений');
    }
    const beforeGold = Object.values(state.players).reduce((n,p) => n+p.gold,0), afterGold = Object.values(s.players).reduce((n,p) => n+p.gold,0);
    return ok({ type: 'Hidden17Changed', at: ctx.now, action: cmd.type, bankDelta: afterGold - beforeGold, patch: { hidden17: h, players: s.players, items: s.items, offers: s.offers, requests: s.requests, lots: s.lots, crafts: s.crafts, trades: s.trades, actions: s.actions } });
  } catch (error) { if (error instanceof Invalid) return fail(error.code, error.message); if (error instanceof TypeError) return fail('invalid', 'Некорректные параметры команды'); throw error; }
}

/** Глобальные ограничения новых правил для прежних команд. */
export function hiddenGuard(state: GameState, cmd: Command): Result | undefined {
  if (!state.hidden17) return;
  if (['session.setN','session.toggleRole','player.chooseSide','altar.contribute','altar.withdraw','story.side'].includes(cmd.type) || (cmd.type === 'gm.correct' && cmd.change.field === 'side')) return fail('forbidden', 'Состав фиксирован; публичных сторон и алтарей нет');
  if (state.hidden17.ritual.step !== 'preparation' && /^(shop\.|ability\.|item\.|offer\.|consent\.accept|lot\.|act\.next)/.test(cmd.type)) return fail('phase', 'Обычные действия остановлены на финал');
  if (cmd.type === 'gm.correct' && cmd.change.field === 'ingredient' && available(state, cmd.playerKey).ingredients[cmd.change.ingredient] + cmd.change.delta < 0) return fail('reserved', 'Ингредиент обещан в сделке или награде');
  if (cmd.type === 'gm.correct' && cmd.change.field === 'itemOwner' && state.items[cmd.change.itemId]?.reservedFor) return fail('reserved', 'Сначала снимите резерв вещи');
  if (cmd.type === 'session.close' && state.hidden17.ritual.step !== 'finished') return fail('phase', 'Сначала завершите пять шагов обряда');
}

/** Согласие предъявить вещь/дать доступ к части принадлежит её текущему владельцу. */
export function hiddenAfterEvent(before: GameState, after: GameState): GameState {
  if (!after.hidden17) return after;
  let next = after;
  const moved = Object.keys(after.items).filter(id => before.items[id] && JSON.stringify(before.items[id].owner) !== JSON.stringify(after.items[id].owner));
  const changedGuise = Object.keys(after.players).filter(key => before.players[key]?.guise?.name !== after.players[key].guise?.name && after.hidden17!.fixedGuise[key]);
  if (moved.length || changedGuise.length) {
    next = { ...after, hidden17: structuredClone(after.hidden17) };
    for (const id of moved) { delete next.hidden17!.presentations[id]; delete next.hidden17!.ritual.permissions[id]; }
    for (const key of changedGuise) delete next.hidden17!.fixedGuise[key];
  }
  return next;
}

/** Резерв награды-способности действует и при создании просьбы, и при её согласовании. */
export function hiddenServiceGuard(state: GameState, author: string, use: AbilityUse): Result | undefined {
  const reservation = Object.values(state.hidden17?.board ?? {}).find(b => b.author === author && b.serviceAbility && activeBoard(b));
  if (!reservation) return;
  if (reservation.status !== 'accepted' || !reservation.worker) return fail('reserved', 'Способность обещана в открытом заказе: дождитесь исполнителя или отмените заказ');
  if (!['cleanseOther', 'discountOther', 'protectOther'].includes(use.kind) || !('target' in use) || use.target !== reservation.worker) return fail('reserved', 'Эта способность зарезервирована для исполнителя принятого заказа');
}
