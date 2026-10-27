// Сценарий вечера (спецификация этапа 6, §2.3): подготовка, три акта по шесть кругов, закрытие и показ итогов.
import { ABILITY_BY_ROLE, type AltarSide, type Command, type PlayerView } from '@fair/shared';
import { actNextLabel } from './checks';
import { fetchCodes } from './client';
import { PLAYER_USER_BASE, REBIND_USER_BASE, type Ctx } from './evening';
import { freeItems } from './items';
import { bidFor, type Act } from './policy';

/** Кругов в акте (§9, решение 1). */
export const ROUNDS = 6;
/** Исправление акта II (§2.3). */
const GOLD_REASON = 'награда за рунный контур';

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
  await ctx.gmTurn(roster.map(roleKey => ({ type: 'player.setPresent', roleKey, present: true }) as Command));

  // «Телефон сел»: ведущий выдаёт новый код, игрок входит с другого аккаунта.
  const rebound = roster[1];
  ctx.drop(rebound);
  await ctx.gmTurn([{ type: 'gm.rebind', roleKey: rebound }]);
  const fresh = (await fetchCodes(ctx.opts.baseUrl)).roles[rebound];
  ctx.turnNo++;
  await ctx.login(rebound, REBIND_USER_BASE + roster.indexOf(rebound) + 1, fresh);

  await ctx.gmTurn([{ type: 'session.open' }]);
  ctx.snapshot('setup');
  await ctx.verifyStart();
}

/** Конец акта: круг ответов, снимок и сверка проекций; затем act.next с парой снимков. */
async function endAct(ctx: Ctx, act: Act): Promise<void> {
  await ctx.answersRound();
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
  const present = ctx.present();
  const keeper = present.find(k => ABILITY_BY_ROLE[k] === 'transferProtection');
  const protector = keeper ? present.find(k => ABILITY_BY_ROLE[k] === 'protectOther') : undefined;
  if (keeper && !protector) ctx.questions.push(`${keeper}: нет защитника, перенос защиты не проверяется`);
  let shielded = false;
  const canceller = present[0];
  const withdrawer = present.find(k => k !== canceller && ctx.content.roleByKey[k].side !== 'free')!;
  let probed = false;

  for (let round = 1; round <= ROUNDS; round++) {
    for (const role of present) {
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

  for (let round = 1; round <= ROUNDS; round++) {
    switch (round) {
      case 1: await gmRound(ctx, [{ type: 'lot.openBidding', id: lotA.id }]); break;
      case 2: await gmRound(ctx, [{ type: 'lot.sealedBids', id: lotA.id }]); break;
      case 3: await gmRound(ctx, [{ type: 'gm.correct', playerKey: present[0], change: { field: 'gold', delta: 1 }, reason: GOLD_REASON }]); break;
      case 4: await gmRound(ctx, [{ type: 'lot.close', id: lotA.id }]); break;
      case 5: await gmRound(ctx, [...(lotB ? [{ type: 'lot.sealedBids', id: lotB.id } as Command] : []), { type: 'clock.extend', minutes: 5 }]); break;
      case 6: await gmRound(ctx, lotB ? [{ type: 'lot.close', id: lotB.id }] : []); break;
    }
    if (round === 1) await probe(ctx, present[0], { type: 'lot.close', id: lotA.id }, 'forbidden');

    let buyer: string | undefined;
    for (const role of present) {
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
    for (const role of present) {
      await ctx.turn(role, {
        before: view => declineOnce(ctx, role, view),
        special: async view => await buyoutOnce(ctx, role, view) || (round === ROUNDS && await useWardOnce(ctx, role, view)),
      });
    }
  }
  await endAct(ctx, 3);
}

/**
 * Выкуп лота по цене (§2.3, акт II, круг 6), один за вечер: если в круге 6 ни у кого не хватило свободного
 * золота, выкуп пробуется в акте III — лот продаётся по цене до закрытия ярмарки. Без этого покрытие
 * lot.buyout при 12 зависело бы от того, кому достался лот акта II (ничья решается случайностью сервера).
 */
async function buyoutOnce(ctx: Ctx, role: string, view: PlayerView): Promise<boolean> {
  if (ctx.log.some(e => e.cmd.type === 'lot.buyout' && e.outcome.ok)) return false;
  const fixed = view.lots.find(l => l.status === 'fixedPrice' && l.fixedPrice !== undefined && view.me.available.gold >= l.fixedPrice);
  if (!fixed) return false;
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
  await ctx.gmTurn([{ type: 'gm.announce', text: 'Итоги показаны. Спасибо за вечер!' }]);
}

/** Весь вечер по §2.3. */
export async function playEvening(ctx: Ctx): Promise<void> {
  await prepare(ctx);
  await act1(ctx);
  await act2(ctx);
  await act3(ctx);
  await closing(ctx);
}
