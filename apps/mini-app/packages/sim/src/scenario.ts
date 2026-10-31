// Сценарий вечера (спецификация этапа 6, §2.3): подготовка, три акта по шесть кругов, закрытие и показ итогов.
import {
  ABILITY_BY_ROLE, type AbilityKind, type AltarSide, type Command, type GameState, type Ingredient, type Item, type PlayerView,
} from '@fair/shared';
import { actNextLabel } from './checks';
import { fetchCodes } from './client';
import { PLAYER_USER_BASE, REBIND_USER_BASE, type Ctx } from './evening';
import { BUY_PRICE, CRAFTED, INGREDIENTS, REFORGEABLE, RECIPE_BY_KIND, freeItems } from './items';

const KIND_BY_RECIPE = Object.fromEntries(Object.entries(RECIPE_BY_KIND).map(([k, r]) => [r, k])) as Record<string, Item['kind']>;
import { bidFor, type Act } from './policy';

/** Кругов в акте (§9, решение 1). */
export const ROUNDS = 6;
/** Исправление акта II (§2.3). */
const GOLD_REASON = 'награда за рунный контур';

/**
 * Опоздавший и ушедший (этап 7, §2.6): Корвин не отмечен при открытии и приходит во втором круге акта I;
 * Никс уходит в третьем круге акта I и возвращается в первом круге акта II. В сценах этапа 6 они не участвуют.
 */
export const LATE_ROLE = 'o11';
export const LEAVING_ROLE = 'o8';
const LATE_ROUND = 2;
const LEAVE_ROUND = 3;
const STAGE7_ROLES = [LATE_ROLE, LEAVING_ROLE];

const nothing = { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] as string[] };

/** Следующий присутствующий по составу после роли (по кругу). */
function neighbourOf(ctx: Ctx, role: string): string {
  const present = ctx.present();
  return present[(present.indexOf(role) + 1) % present.length];
}

/** Подготовка: состав, снять и вернуть роль, входы, явка, репетиция «телефон сел», открытие. */
async function prepare(ctx: Ctx): Promise<void> {
  await ctx.loginGm();
  await ctx.gmTurn([{ type: 'session.setN', n: ctx.opts.players }]);
  const toggled = ctx.gmState().roster.at(-1)!;
  await ctx.gmTurn([{ type: 'session.toggleRole', roleKey: toggled }, { type: 'session.toggleRole', roleKey: toggled }]);

  const roster = ctx.gmState().roster;
  const codes = (await fetchCodes(ctx.opts.baseUrl)).roles;
  ctx.turnNo++;
  for (const [i, role] of roster.entries()) await ctx.login(role, PLAYER_USER_BASE + i + 1, codes[role]);
  // Корвин входит, но ведущий не отмечает его приход до акта I.
  await ctx.gmTurn(roster.filter(k => k !== LATE_ROLE).map(roleKey => ({ type: 'player.setPresent', roleKey, present: true }) as Command));

  // «Телефон сел»: ведущий выдаёт новый код, игрок входит с другого аккаунта.
  const rebound = roster.filter(k => !STAGE7_ROLES.includes(k))[1];
  ctx.drop(rebound);
  await ctx.gmTurn([{ type: 'gm.rebind', roleKey: rebound }]);
  const fresh = (await fetchCodes(ctx.opts.baseUrl)).roles[rebound];
  ctx.turnNo++;
  await ctx.login(rebound, REBIND_USER_BASE + roster.indexOf(rebound) + 1, fresh);

  await ctx.gmTurn([{ type: 'session.open' }]);
  ctx.snapshot('setup');
  await ctx.verifyStart(roster.includes(LATE_ROLE) ? [LATE_ROLE] : []);
}

/** Конец акта: круг ответов, шаги сценария после него, снимок и сверка проекций; затем act.next с парой снимков. */
async function endAct(ctx: Ctx, act: Act, afterAnswers?: () => Promise<void>): Promise<void> {
  await ctx.answersRound();
  await afterAnswers?.();
  ctx.snapshot(`act${act}`);
  await ctx.verifyViews(`act${act}`);
  if (act === 3) return;
  const next = (act + 1) as 2 | 3;
  ctx.snapshot(actNextLabel(next, 'до'));
  await ctx.gmTurn([{ type: 'act.next' }]);
  ctx.snapshot(actNextLabel(next, 'после'));
}

/** Нарочная проба: ожидается отказ с кодом; ход в журнале помечен expectedRefusal. */
async function probe(ctx: Ctx, role: string, cmd: Command, code: string): Promise<void> {
  ctx.turnNo++;
  await ctx.send(role, cmd, code);
  await ctx.waitAll();
}

/** Ход ведущего в начале круга; пустой список — хода нет. */
async function gmRound(ctx: Ctx, cmds: Command[]): Promise<void> {
  if (cmds.length > 0) await ctx.gmTurn(cmds);
}

/** Своя последняя запись по ключу из состояния ведущего (id предложения или вклада после создания). */
function lastOwnOffer(ctx: Ctx, role: string): string | undefined {
  return Object.values(ctx.gmState().offers).filter(o => o.from === role && o.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).at(-1)?.id;
}
function lastOwnContribution(ctx: Ctx, role: string, side: AltarSide): string | undefined {
  return ctx.gmState().altars[side]?.contributions.filter(c => c.player === role).at(-1)?.id;
}

/** Акт I: защита для Клёпы, выбор стороны во втором круге, отмена предложения, изъятие вклада, проба чужого согласия. */
async function act1(ctx: Ctx): Promise<void> {
  ctx.startAct(1);
  // Роли сцен выбираются из постоянных участников: опоздавший и ушедший в сценах этапа 6 не участвуют.
  const present = ctx.present().filter(k => !STAGE7_ROLES.includes(k));
  const roster = ctx.gmState().roster;
  const keeper = present.find(k => ABILITY_BY_ROLE[k] === 'transferProtection');
  const protector = keeper ? present.find(k => ABILITY_BY_ROLE[k] === 'protectOther') : undefined;
  if (keeper && !protector) ctx.questions.push(`${keeper}: нет защитника, перенос защиты не проверяется`);
  let shielded = false;
  const canceller = present[0];
  const withdrawer = present.find(k => k !== canceller && ctx.content.roleByKey[k].side !== 'free')!;
  let probed = false;

  for (let round = 1; round <= ROUNDS; round++) {
    if (round === LATE_ROUND && roster.includes(LATE_ROLE)) {
      await gmRound(ctx, [{ type: 'player.setPresent', roleKey: LATE_ROLE, present: true }]);
      await ctx.verifyArrived(LATE_ROLE);
    }
    if (round === LEAVE_ROUND && roster.includes(LEAVING_ROLE)) await gmRound(ctx, [{ type: 'player.setPresent', roleKey: LEAVING_ROLE, present: false }]);
    // Состав круга по состоянию; ушедший продолжает ходить до конца акта и получает отказ phase.
    const s = ctx.gmState();
    const order = roster.filter(k => s.players[k]?.present || (k === LEAVING_ROLE && round >= LEAVE_ROUND));
    for (const role of order) {
      const free = ctx.content.roleByKey[role].side === 'free';
      await ctx.turn(role, {
        // Свободная роль выбирает сторону на первом ходу второго круга, не раньше.
        veto: cmd => cmd.type === 'player.chooseSide' && round < 2,
        special: async view => {
          if (role === protector && !shielded && !view.me.player.abilityUsedInAct) {
            shielded = true;
            await ctx.send(role, { type: 'ability.use', use: { kind: 'protectOther', target: keeper! } });
            return true;
          }
          if (round === 2 && free && view.me.player.side === undefined) {
            const sides = view.altars.map(a => a.side).sort();
            await ctx.send(role, { type: 'player.chooseSide', side: ctx.rng.pick(sides) });
            return true;
          }
          if (round === 3 && role === canceller) return createAndCancel(ctx, role);
          if (round >= 3 && await ensureCraftedOnce(ctx, role, view)) return true;
          if (round === 4 && role === withdrawer) return withdrawAndReturn(ctx, role, view);
          return false;
        },
      });
      if (!probed) probed = await probeConsent(ctx);
    }
  }
  if (!probed) ctx.missedProbes.push('акт I: чужой consent.accept (не было открытой просьбы)');
  await endAct(ctx, 1);
}

/** Способности, которым нужно своё изделие (§2.4): без него useFor возвращает null. */
const NEEDS_CRAFTED: Partial<Record<AbilityKind, Item['kind'][]>> = { disassemble: CRAFTED, sellToBank: CRAFTED, reforge: REFORGEABLE };

/**
 * Изделие для способности: если к кругу 3 акта I у Грима, Хельги или Магды нет своего изделия, оркестратор
 * в её ход покупает недостающие ингредиенты и изготавливает самое дешёвое из подходящих (раньше политики).
 * Без этого способность могла не сработать за весь вечер: политика ведёт изготовление по целям роли.
 * Раз за вечер на роль; если золота не хватает, пробует в следующих кругах.
 */
async function ensureCraftedOnce(ctx: Ctx, role: string, view: PlayerView): Promise<boolean> {
  const kinds = NEEDS_CRAFTED[ABILITY_BY_ROLE[role]];
  if (!kinds || ctx.craftedFor.has(role) || freeItems(view, kinds).length > 0) return false;
  const have = view.me.available;
  const plans = view.recipes
    .filter(r => kinds.includes(KIND_BY_RECIPE[r.id] ?? 'relic'))
    .map(r => {
      const buys = INGREDIENTS.flatMap(k => Array<Ingredient>(Math.max(0, (r.cost[k] ?? 0) - have.ingredients[k])).fill(k));
      return { r, buys, price: r.gold + BUY_PRICE * buys.length };
    })
    .filter(p => p.price <= have.gold && p.buys.every(k => view.workshop[k] >= p.buys.filter(x => x === k).length))
    .sort((a, b) => a.price - b.price || a.r.id.localeCompare(b.r.id));
  const plan = plans[0];
  if (!plan) return false;
  ctx.craftedFor.add(role);
  for (const k of plan.buys) {
    const r = await ctx.send(role, { type: 'shop.buy', ingredient: k });
    if (!r.ok) return true;
  }
  await ctx.waitAll();
  await ctx.send(role, { type: 'shop.craft', recipeId: plan.r.id });
  return true;
}

/** Предложение соседу и его отмена в том же ходу, до ответа соседа. */
async function createAndCancel(ctx: Ctx, role: string): Promise<boolean> {
  const to = neighbourOf(ctx, role);
  const r = await ctx.send(role, { type: 'offer.create', to, give: nothing, get: { ...nothing, gold: 1 }, service: true });
  if (!r.ok) return true;
  await ctx.waitAll();
  const id = lastOwnOffer(ctx, role);
  if (id) await ctx.send(role, { type: 'offer.cancel', id });
  return true;
}

/** Вклад 2 золота, изъятие и повторный вклад в том же ходу. */
async function withdrawAndReturn(ctx: Ctx, role: string, view: PlayerView): Promise<boolean> {
  const side = view.me.role.side as AltarSide;
  const r = await ctx.send(role, { type: 'altar.contribute', side, gold: 2 });
  if (!r.ok) return true;
  await ctx.waitAll();
  const id = lastOwnContribution(ctx, role, side);
  if (!id) return true;
  await ctx.send(role, { type: 'altar.withdraw', contributionId: id });
  await ctx.send(role, { type: 'altar.contribute', side, gold: 2 });
  return true;
}

/** Проба акта I: игрок, который не автор и не одобряющий, принимает чужую просьбу; ожидается forbidden. */
async function probeConsent(ctx: Ctx): Promise<boolean> {
  const req = Object.values(ctx.gmState().requests).find(r => r.status === 'pending');
  if (!req) return false;
  const stranger = ctx.present().find(k => k !== req.author && !req.approvers.includes(k));
  if (!stranger) return false;
  await probe(ctx, stranger, { type: 'consent.accept', id: req.id }, 'forbidden');
  return true;
}

/** Акт II: торг за лот акта, при 12 второй лот без ставок и выкуп; исправление, продление, отмена просьбы. */
async function act2(ctx: Ctx): Promise<void> {
  ctx.startAct(2);
  const present = ctx.present();
  const lots = Object.values(ctx.gmState().lots).filter(l => l.status === 'announced');
  const lotA = lots.find(l => l.act === 2)!;
  const lotB = lots.find(l => l.id !== lotA.id);
  let cancelled = false;

  const back: Command[] = ctx.gmState().roster.includes(LEAVING_ROLE) ? [{ type: 'player.setPresent', roleKey: LEAVING_ROLE, present: true }] : [];

  for (let round = 1; round <= ROUNDS; round++) {
    switch (round) {
      // Никс возвращается в первом круге: без второго стартового набора.
      case 1: await gmRound(ctx, [...back, { type: 'lot.openBidding', id: lotA.id }]); break;
      case 2: await gmRound(ctx, [{ type: 'lot.sealedBids', id: lotA.id }]); break;
      case 3: await gmRound(ctx, [{ type: 'gm.correct', playerKey: present[0], change: { field: 'gold', delta: 1 }, reason: GOLD_REASON }]); break;
      case 4: await gmRound(ctx, [{ type: 'lot.close', id: lotA.id }]); break;
      case 5: await gmRound(ctx, [...(lotB ? [{ type: 'lot.sealedBids', id: lotB.id } as Command] : []), { type: 'clock.extend', minutes: 5 }]); break;
      case 6: await gmRound(ctx, lotB ? [{ type: 'lot.close', id: lotB.id }] : []); break;
    }
    if (round === 1) await probe(ctx, present[0], { type: 'lot.close', id: lotA.id }, 'forbidden');

    let buyer: string | undefined;
    for (const role of ctx.present()) {
      await ctx.turn(role, {
        special: async view => {
          if (round === 2 || round === 3) {
            const amount = bidFor(view, lotA.id, ctx.mem[role], ctx.rng);
            if (amount !== null) { await ctx.send(role, { type: 'lot.bid', id: lotA.id, amount }); return true; }
          }
          if (round === 6 && buyer === undefined && await buyoutOnce(ctx, role, view)) { buyer = role; return true; }
          return false;
        },
        // Одна отмена своей просьбы за акт: сразу после создания, до ответа одобряющего.
        after: async (cmd, outcome) => {
          if (cancelled || cmd.type !== 'ability.use' || !outcome.ok) return;
          await ctx.waitAll();
          const pending = ctx.gmState().players[role].abilityPending;
          if (!pending) return;
          cancelled = true;
          await ctx.send(role, { type: 'consent.cancel', id: pending });
        },
      });
    }
  }
  if (!cancelled) ctx.missedProbes.push('акт II: consent.cancel (ни одной своей просьбы о способности)');
  await endAct(ctx, 2);
}

/** Акт III: вещи и враждебные способности, объявление, пауза на последнем круге, проба закрытия игроком. */
async function act3(ctx: Ctx): Promise<void> {
  ctx.startAct(3);
  const present = ctx.present();
  for (let round = 1; round <= ROUNDS; round++) {
    if (round === 1) {
      await gmRound(ctx, [{ type: 'gm.announce', text: 'Последний акт: торопитесь к алтарям.' }]);
      await probe(ctx, present[0], { type: 'session.close' }, 'forbidden');
    }
    // Пауза и снятие подряд: в промежутке ботов не вызывают.
    if (round === ROUNDS) await gmRound(ctx, [{ type: 'clock.pause' }, { type: 'clock.resume' }]);
    for (const role of ctx.present()) {
      await ctx.turn(role, {
        before: view => declineOnce(ctx, role, view),
        special: async view => await buyoutOnce(ctx, role, view) || (round === ROUNDS && await useWardOnce(ctx, role, view)),
      });
    }
  }
  // После круга ответов: дальше до закрытия никто не ходит, и собранное не уйдёт по сделке.
  await endAct(ctx, 3, async () => {
    await assembleAltarOnce(ctx);
    await tellTruthOnce(ctx);
  });
}

/** Алтарь, который собирает сценарий, и пороги готовности (копия READY из engine/closing.ts). */
const ALTAR_SIDE: AltarSide = 'wake';
const READY = { shards: 3, focuses: 2, gold: 6, donors: 3 };
/** Золото от каждого из трёх вкладчиков: 3 × 2 = 6. */
const GOLD_EACH = 2;
const ALTAR_REASON = 'проверка готовности алтаря';
const TRUTH_REASON = 'проверка «Правды»';

const correctOwner = (playerKey: string, itemId: string, reason: string): Command =>
  ({ type: 'gm.correct', playerKey, change: { field: 'itemOwner', itemId, owner: { type: 'player', key: playerKey } }, reason });

/** Присутствующие на стороне алтаря: роли этой фракции и свободные, выбравшие её. */
function sideMembers(ctx: Ctx, side: AltarSide): string[] {
  const s = ctx.gmState();
  return ctx.present().filter(k => {
    const own = ctx.content.roleByKey[k]?.side;
    return own === side || (own === 'free' && s.players[k].side === side);
  });
}

/** Вещи на алтаре стороны. */
const onAltar = (s: GameState, side: AltarSide) =>
  Object.values(s.items).filter(i => i.owner.type === 'altar' && i.owner.side === side);

/**
 * Вещь, которую ведущий может передать: у игрока или на другом алтаре, не в лоте, не скрыта и не в резерве.
 * Порядок стабильный (ref, автор изделия), серверный id не участвует.
 */
function movable(s: GameState, side: AltarSide, kind: Item['kind']): Item[] {
  return Object.values(s.items)
    .filter(i => i.kind === kind && i.reservedFor === undefined && i.hiddenUntilAct === undefined
      && (i.owner.type === 'player' ? s.players[i.owner.key]?.present === true : i.owner.type === 'altar' && i.owner.side !== side))
    .sort((a, b) => a.ref.localeCompare(b.ref) || (a.createdBy ?? '').localeCompare(b.createdBy ?? ''));
}

/** Вкладчик вещи на алтарь: игрок отдаёт вещь своим ходом, отказ виден в журнале и в проверке итогов. */
async function contribute(ctx: Ctx, role: string, itemId: string): Promise<void> {
  await ctx.send(role, { type: 'altar.contribute', side: ALTAR_SIDE, itemId });
}

/**
 * Сбор алтаря пробуждения (§2.3, акт III, после последнего круга), один за вечер. Случайная игра ботов
 * не доводит ни один алтарь до готовности, и ветки итогов с исходом алтаря иначе не проверялись бы.
 * Ведущий исправлением «вещь у игрока» отдаёт трём участникам стороны недостающие разные осколки и Фокусы,
 * они кладут их на алтарь и вносят по 2 золота (недостающее золото добавляет ведущий). Если Фокусов в игре
 * не хватает, ведущий выдаёт Пепел, Пыль и золото, и участник изготавливает Фокус сам. Без случайности.
 */
export async function assembleAltarOnce(ctx: Ctx): Promise<void> {
  if (ctx.altarAssembled) return;
  const members = sideMembers(ctx, ALTAR_SIDE).slice(0, READY.donors);
  if (members.length < READY.donors) {
    ctx.stepSkips.push(`сбор алтаря: на стороне ${ALTAR_SIDE} ${members.length} присутствующих, нужно ${READY.donors}`);
    return;
  }
  const holder = (i: number) => members[i % members.length];
  let s = ctx.gmState();

  // Осколки: недостающие разные ref, по одному предмету на ref.
  const haveShards = new Set(onAltar(s, ALTAR_SIDE).filter(i => i.kind === 'shard').map(i => i.ref));
  const shards: Item[] = [];
  for (const it of movable(s, ALTAR_SIDE, 'shard')) {
    if (haveShards.size + shards.length >= READY.shards) break;
    if (!haveShards.has(it.ref) && !shards.some(x => x.ref === it.ref)) shards.push(it);
  }
  if (haveShards.size + shards.length < READY.shards) {
    ctx.stepSkips.push(`сбор алтаря: в игре ${haveShards.size + shards.length} разных осколков вне лотов, нужно ${READY.shards}`);
    return;
  }
  const focusNeed = Math.max(0, READY.focuses - onAltar(s, ALTAR_SIDE).filter(i => i.kind === 'focus').length);
  const focuses = movable(s, ALTAR_SIDE, 'focus').slice(0, focusNeed);
  const toCraft = focusNeed - focuses.length;

  const moves: { item: Item; to: string }[] = [...shards, ...focuses].map((item, i) => ({ item, to: holder(i) }));
  const cmds: Command[] = moves
    .filter(m => !(m.item.owner.type === 'player' && m.item.owner.key === m.to))
    .map(m => correctOwner(m.to, m.item.id, ALTAR_REASON));
  // Фокус своими руками: ингредиенты по рецепту и золото на работу (с запасом на шипы).
  const crafters = Array.from({ length: toCraft }, (_, i) => holder(moves.length + i));
  for (const c of crafters) {
    cmds.push(
      { type: 'gm.correct', playerKey: c, change: { field: 'ingredient', ingredient: 'ash', delta: 1 }, reason: ALTAR_REASON },
      { type: 'gm.correct', playerKey: c, change: { field: 'ingredient', ingredient: 'moon', delta: 1 }, reason: ALTAR_REASON },
      { type: 'gm.correct', playerKey: c, change: { field: 'gold', delta: 2 }, reason: ALTAR_REASON },
    );
  }
  // Золото: каждому из трёх вкладчиков до 2 свободных золотых сверх уже внесённого.
  const goldNeed = members.map(m => {
    const given = (s.altars[ALTAR_SIDE]?.contributions ?? []).filter(c => c.player === m).reduce((n, c) => n + (c.gold ?? 0), 0);
    return Math.max(0, GOLD_EACH - given);
  });
  members.forEach((m, i) => {
    const p = s.players[m];
    // Изготовителю ведущий дал 2 золота на работу, а она стоит не больше 2: свободное золото не уменьшится.
    const spare = p.gold - p.reservedGold;
    if (goldNeed[i] > spare) cmds.push({ type: 'gm.correct', playerKey: m, change: { field: 'gold', delta: goldNeed[i] - Math.max(0, spare) }, reason: ALTAR_REASON });
  });

  ctx.altarAssembled = true;
  if (cmds.length > 0) await ctx.gmTurn(cmds);
  ctx.turnNo++;
  for (const m of moves) await contribute(ctx, m.to, m.item.id);
  for (const c of crafters) {
    const before = new Set(Object.keys(ctx.gmState().items));
    await ctx.send(c, { type: 'shop.craft', recipeId: RECIPE_BY_KIND.focus! });
    await ctx.waitAll();
    s = ctx.gmState();
    const made = Object.values(s.items).find(i => !before.has(i.id) && i.kind === 'focus' && i.owner.type === 'player' && i.owner.key === c);
    if (made) await contribute(ctx, c, made.id);
  }
  for (const [i, m] of members.entries()) {
    if (goldNeed[i] > 0) await ctx.send(m, { type: 'altar.contribute', side: ALTAR_SIDE, gold: goldNeed[i] });
  }
  await ctx.waitAll();
}

/**
 * «Правда» (§2.3, акт III, после сбора алтаря), один раз за вечер: ведущий исправлением отдаёт одному
 * присутствующему все три улики. Держатель — тот, у кого улик больше (при равенстве первый по составу),
 * кроме опоздавшего и ушедшего.
 * Улика в лоте (не продана) или вне игры — шаг пропускается с пометкой.
 */
export async function tellTruthOnce(ctx: Ctx): Promise<void> {
  if (ctx.truthFor !== undefined) return;
  const s = ctx.gmState();
  const present = ctx.present();
  const refs = ctx.content.clues.map(c => c.id);
  const clues = refs.map(ref => ({ ref, item: Object.values(s.items).find(i => i.kind === 'clue' && i.ref === ref) }));
  const lost = clues.filter(c => !c.item || c.item.owner.type !== 'player' || !present.includes(c.item.owner.key) || c.item.reservedFor !== undefined);
  if (lost.length > 0) {
    ctx.stepSkips.push(`«Правда»: ${lost.map(c => `улика ${c.ref} ${!c.item ? 'не в игре' : c.item.owner.type === 'lot' ? 'в непроданном лоте' : 'недоступна'}`).join(', ')}`);
    return;
  }
  const count = (k: string) => clues.filter(c => c.item!.owner.type === 'player' && c.item!.owner.key === k).length;
  // Опоздавший и ушедший в сценах этапа 6 не участвуют (§2.6): держатель из постоянных участников.
  const steady = present.filter(k => !STAGE7_ROLES.includes(k));
  const holder = [...steady].sort((a, b) => count(b) - count(a) || steady.indexOf(a) - steady.indexOf(b))[0];
  const cmds = clues
    .filter(c => !(c.item!.owner.type === 'player' && c.item!.owner.key === holder))
    .map(c => correctOwner(holder, c.item!.id, TRUTH_REASON));
  ctx.truthFor = holder;
  if (cmds.length > 0) await ctx.gmTurn(cmds);
}

/**
 * Выкуп лота по цене (§2.3, акт II, круг 6), один за вечер: если в круге 6 ни у кого не хватило свободного
 * золота, выкуп пробуется в акте III — лот продаётся по цене до закрытия ярмарки. Без этого покрытие
 * lot.buyout при 12 зависело бы от того, кому достался лот акта II (ничья решается случайностью сервера).
 */
async function buyoutOnce(ctx: Ctx, role: string, view: PlayerView): Promise<boolean> {
  if (ctx.log.some(e => e.cmd.type === 'lot.buyout' && e.outcome.ok)) return false;
  const fixed = view.lots.find(l => l.status === 'fixedPrice' && l.fixedPrice !== undefined && !ctx.buyoutTried.has(l.id)
    && view.me.available.gold >= l.fixedPrice);
  if (!fixed) return false;
  ctx.buyoutTried.add(fixed.id);
  await ctx.send(role, { type: 'lot.buyout', id: fixed.id });
  return true;
}

/**
 * Покрытие вида ward (§3.6): если до последнего круга акта III талисман не применил никто, его применяет
 * первый по составу держатель без защиты, даже когда талисман нужен его цели «держать». Иначе покрытие
 * зависело бы от зерна: талисманов за вечер на 12 изготавливают один-два, и они могут уйти к такому игроку.
 */
async function useWardOnce(ctx: Ctx, role: string, view: PlayerView): Promise<boolean> {
  const used = ctx.log.some(e => e.cmd.type === 'item.use' && e.outcome.ok && ctx.itemKinds[e.cmd.itemId] === 'ward');
  if (used || view.me.player.protection !== undefined) return false;
  const ward = freeItems(view, ['ward'])[0];
  if (!ward) return false;
  await ctx.send(role, { type: 'item.use', itemId: ward.id });
  return true;
}

/**
 * Покрытие consent.decline: если случай (3/4 «да» на просьбы о вещах) ещё не дал отказа, первую открытую
 * просьбу о вещи ко мне в акте III я отклоняю. Без этого покрытие зависело бы от зерна: просьб о вещах за вечер мало.
 */
async function declineOnce(ctx: Ctx, role: string, view: PlayerView): Promise<void> {
  if (ctx.log.some(e => e.cmd.type === 'consent.decline' && e.outcome.ok)) return;
  const req = view.requests.find(r => r.status === 'pending' && r.action.type === 'item' && r.approvers.includes(role) && !r.approved.includes(role));
  if (req) await ctx.send(role, { type: 'consent.decline', id: req.id });
}

/** Закрытие, исправление цели после закрытия, показ итогов, объявление после показа. */
async function closing(ctx: Ctx): Promise<void> {
  const first = ctx.present()[0];
  await ctx.gmTurn([{ type: 'session.close' }]);
  ctx.snapshot('closed');
  await ctx.verifyViews('closed');
  await ctx.gmTurn([
    { type: 'gm.correct', playerKey: first, change: { field: 'goal', index: 0, value: true }, reason: 'цель выполнена у стола ведущего' },
    { type: 'gm.correct', playerKey: first, change: { field: 'goal', index: 0, value: null }, reason: 'вернуть расчёт по журналу' },
  ]);
  await ctx.gmTurn([{ type: 'session.reveal' }]);
  ctx.snapshot('revealed');
  await ctx.verifyViews('revealed');
  ctx.verifyClosing();
  await ctx.gmTurn([{ type: 'gm.announce', text: 'Итоги показаны. Спасибо за вечер!' }]);
}

/** Свободная заявка и ручное вмешательство, не меняющие баланс основного сценария. */
async function freePlay(ctx: Ctx): Promise<void> {
  const owner = ctx.present()[0];
  await ctx.send(owner, { type: 'story.request', title: 'Услышать тень', text: 'Предлагаю спросить имя у тени', stake: 'Обещание' });
  await ctx.waitAll();
  let q = Object.values(ctx.gmState().story!.requests).at(-1)!;
  await ctx.send(owner, { type: 'story.cancel', id: q.id, revision: q.revision });
  await ctx.gmTurn([{ type: 'story.card.save', card: {
    kind: 'ability', owner, title: 'Голос тени', text: 'Ответ подтверждает ведущий', price: '',
    visibility: 'private', readers: [], uses: 1, duration: 'act', replacesAbility: false, active: true, completed: false,
  } }]);
  const card = Object.values(ctx.gmState().story!.cards).at(-1)!;
  await ctx.send(owner, { type: 'story.request', title: 'Применить голос', text: 'Спросить имя', stake: '', cardId: card.id });
  await ctx.waitAll();
  q = Object.values(ctx.gmState().story!.requests).at(-1)!;
  await ctx.gmTurn([
    { type: 'story.respond', id: q.id, revision: q.revision, status: 'done', reply: 'Тень назвала имя' },
    { type: 'story.message', title: 'Шёпот', text: 'Ответ известен только тебе', recipients: [owner] },
    { type: 'story.side', player: owner, side: 'free', reason: 'Временная клятва' },
  ]);
  await ctx.gmTurn([{ type: 'story.undo', id: ctx.gmState().story!.history.at(-1)!.id }]);
}

/** Весь вечер по §2.3. */
export async function playEvening(ctx: Ctx): Promise<void> {
  await prepare(ctx);
  await freePlay(ctx);
  await act1(ctx);
  await act2(ctx);
  await act3(ctx);
  await closing(ctx);
}
