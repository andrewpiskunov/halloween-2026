// Нагрузочный прогон (спецификация этапа 7, §9): боты в акте I действуют параллельно, замеры по минутам.
import type { Command, GmView, PlayerView } from '@fair/shared';
import { fetchCodes, openBot, type BotConn, type CmdOutcome } from './client';
import { GM_USER_ID, PLAYER_USER_BASE } from './evening';
import { answerIncoming, playerAction, type TurnMemory } from './policy';
import { Rng } from './rng';

export interface LoadOptions {
  baseUrl: string;
  /** Число ботов-игроков; состав ярмарки не меньше 12 (MIN_N движка), лишние роли не отмечаются. */
  players: number;
  seconds: number;
  /** Средний интервал между ходами бота; разброс ±20 % от генератора бота. */
  intervalMs: number;
  seed: number;
  log?: (line: string) => void;
  /** Для тестов: соединения ботов сразу после входа (например, чтобы закрыть одно посреди прогона). */
  onBots?: (bots: BotConn[]) => void;
}

export interface LoadMinute {
  minute: number;
  commands: number;
  p50: number;
  p95: number;
  max: number;
  /** Байты: самая большая проекция игрока и проекция ведущего к концу минуты. */
  player: number;
  gm: number;
  /** rss сервера к концу минуты в байтах; null, если /api/health не отдаёт память (нет ALLOW_DEV_AUTH). */
  rss: number | null;
}

export interface LoadResult {
  ok: boolean;
  minutes: LoadMinute[];
  reconnects: number;
  failures: string[];
  /** Отказы по кодам (insufficient, phase…): для отчёта, не критерий. */
  refusals: Record<string, number>;
}

/** Критерии §9. */
export const LOAD_P95_LIMIT_MS = 300;
export const LOAD_RSS_GROWTH = 1.5;
/** Ведущий продлевает часы акта раз в 20 минут, чтобы пульт не ругался на истёкшее время. */
const EXTEND_EVERY_MS = 20 * 60_000;
const MINUTE_MS = 60_000;
/** Состав движка: от 12 до 30 ролей. */
const MIN_ROSTER = 12;
const MAX_ROSTER = 30;
const JITTER = 0.2;

const round1 = (x: number) => Math.round(x * 10) / 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)));

/** Генератор бота: свой поток от зерна прогона и номера бота, чтобы паузы и решения не зависели от соседей. */
export const botRng = (seed: number, index: number) => new Rng((Math.imul(seed, 0x9e3779b1) + index + 1) >>> 0);

/** Нарушенные критерии §9 по-русски; пустой список — всё выполнено. */
export function evaluateLoad(minutes: LoadMinute[], reconnects: number): string[] {
  const failures: string[] = [];
  for (const m of minutes) {
    if (m.p95 > LOAD_P95_LIMIT_MS) failures.push(`p95 в минуте ${m.minute}: ${m.p95} мс, больше ${LOAD_P95_LIMIT_MS} мс`);
  }
  if (minutes.length >= 2) {
    const second = minutes[1].rss;
    const last = minutes[minutes.length - 1].rss;
    if (second !== null && last !== null && last > LOAD_RSS_GROWTH * second) {
      const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
      failures.push(`rss в последней минуте ${mb(last)} МБ больше чем в ${LOAD_RSS_GROWTH} раза rss второй минуты (${mb(second)} МБ)`);
    }
  }
  if (reconnects > 0) failures.push(`переподключение ботов: ${reconnects}, допустимо 0`);
  return failures;
}

async function rssOf(baseUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) return null;
    const h = await res.json() as { memory?: { rss: number } };
    return h.memory?.rss ?? null;
  } catch {
    return null;
  }
}

/** Отметка времени ответа: момент прихода (мс от начала) и задержка. */
interface Sample { at: number; ms: number }

/**
 * Прогон: ведущий ставит состав, отмечает ботов пришедшими и открывает ярмарку; затем боты параллельно
 * ходят до истечения seconds. Закрытое соединение считается переподключением: бот выбывает, прогон идёт дальше.
 * Сессия должна быть свежей (фаза setup); session.reset не посылается.
 */
export async function runLoad(opts: LoadOptions): Promise<LoadResult> {
  if (!Number.isInteger(opts.players) || opts.players < 1 || opts.players > MAX_ROSTER) {
    throw new Error(`players: от 1 до ${MAX_ROSTER}, получено ${opts.players}`);
  }
  const log = opts.log ?? (() => {});
  const codes = await fetchCodes(opts.baseUrl);
  const gm = await openBot(opts.baseUrl, GM_USER_ID, codes.gm);
  const bots: BotConn[] = [];
  try {
    if (gm.actor.type !== 'gm') throw new Error('код ведущего не дал роль ведущего');
    const phase = (gm.view() as GmView).state.phase;
    if (phase !== 'setup') throw new Error(`фаза ${phase}, нужна setup: прогон идёт только на свежей сессии`);

    const gmMust = async (cmd: Command) => {
      const r = await gm.send(cmd);
      if (!r.ok) throw new Error(`ведущий: ${cmd.type} → ${r.error}${r.detail ? ` (${r.detail})` : ''}`);
      await gm.waitSeq(r.seq!);
    };
    await gmMust({ type: 'session.setN', n: Math.max(MIN_ROSTER, opts.players) });
    const roster = (gm.view() as GmView).state.roster;
    const roles = roster.slice(0, opts.players);
    const roleCodes = (await fetchCodes(opts.baseUrl)).roles;
    for (const [i, role] of roles.entries()) bots.push(await openBot(opts.baseUrl, PLAYER_USER_BASE + i + 1, roleCodes[role]));
    for (const role of roles) await gmMust({ type: 'player.setPresent', roleKey: role, present: true });
    await gmMust({ type: 'session.open' });
    log(`открыто: ${roles.length} ботов, состав ${roster.length}`);
    opts.onBots?.(bots);

    const started = performance.now();
    const deadline = started + opts.seconds * 1000;
    const samples: Sample[] = [];
    const refusals: Record<string, number> = {};
    let reconnects = 0;
    const errors: string[] = [];

    /** Команда бота с замером; закрытие соединения — исключение для цикла. */
    const send = async (bot: BotConn, cmd: Command): Promise<CmdOutcome> => {
      const o = await bot.send(cmd);
      samples.push({ at: performance.now() - started, ms: o.ms });
      if (!o.ok) refusals[o.error ?? '?'] = (refusals[o.error ?? '?'] ?? 0) + 1;
      return o;
    };

    const loop = async (bot: BotConn, index: number): Promise<void> => {
      const rng = botRng(opts.seed, index);
      const role = roles[index];
      const mem: TurnMemory = { abilityUsedAct: null, boughtPending: null, serviceDone: false, cancelDone: true, withdrawDone: true, bids: {} };
      let skipAbility = false;
      let lastSeq = bot.seq();
      try {
        for (;;) {
          const wait = opts.intervalMs * (1 - JITTER + 2 * JITTER * rng.next());
          await sleep(Math.min(wait, deadline - performance.now()));
          if (bot.closed()) throw new Error('закрыто');
          if (performance.now() >= deadline) return;
          await bot.waitSeq(lastSeq);
          for (const cmd of answerIncoming(bot.view() as PlayerView, rng)) {
            const o = await send(bot, cmd);
            if (o.ok && o.seq !== undefined) lastSeq = Math.max(lastSeq, o.seq);
          }
          await bot.waitSeq(lastSeq);
          const view = bot.view() as PlayerView;
          // Способность раз в акт по состоянию; после отказа следующий ход отдаётся остальной политике.
          mem.abilityUsedAct = skipAbility || view.me.player.abilityUsedInAct ? 1 : null;
          skipAbility = false;
          const cmd = playerAction(view, 1, mem, rng, roster);
          if (!cmd) continue;
          const o = await send(bot, cmd);
          if (o.ok && o.seq !== undefined) lastSeq = Math.max(lastSeq, o.seq);
          if (cmd.type === 'shop.buy' && !o.ok) mem.boughtPending = null;
          if (cmd.type === 'ability.use' && !o.ok) skipAbility = true;
        }
      } catch (err) {
        if (bot.closed()) {
          reconnects++;
          log(`${role}: соединение закрыто, бот выбыл`);
        } else {
          errors.push(`${role}: ${(err as Error).message}`);
        }
      }
    };

    const minuteCount = Math.max(1, Math.ceil(opts.seconds / 60));
    // Замер минуты i: размеры в момент вызова, rss из /api/health. Ответы приходят в любом порядке, поэтому по индексу.
    const probes: ({ player: number; gm: number; rss: number | null } | undefined)[] = Array(minuteCount).fill(undefined);
    const probe = async (i: number) => {
      const sizes = { player: Math.max(0, ...bots.map(b => b.maxViewBytes())), gm: gm.maxViewBytes() };
      probes[i] = { ...sizes, rss: await rssOf(opts.baseUrl) };
    };
    const pending: Promise<void>[] = [];
    // Замер в конце каждой полной минуты, кроме последней: её закрывает замер после прогона.
    const timers = Array.from({ length: minuteCount - 1 }, (_, i) => setTimeout(() => { pending.push(probe(i)); }, (i + 1) * MINUTE_MS));
    const extendTimers: NodeJS.Timeout[] = [];
    for (let t = EXTEND_EVERY_MS; t < opts.seconds * 1000; t += EXTEND_EVERY_MS) {
      extendTimers.push(setTimeout(() => {
        gm.send({ type: 'clock.extend', minutes: 20 }).then(
          r => { if (!r.ok) errors.push(`ведущий: clock.extend → ${r.error}`); },
          (e: Error) => errors.push(`ведущий: clock.extend: ${e.message}`),
        );
      }, t));
    }
    try {
      await Promise.all(bots.map((b, i) => loop(b, i)));
    } finally {
      for (const t of [...timers, ...extendTimers]) clearTimeout(t);
    }
    await Promise.all(pending);
    await probe(minuteCount - 1);
    if (gm.closed()) reconnects++;

    const minutes: LoadMinute[] = probes.map((p = { player: 0, gm: 0, rss: null }, i) => {
      const ms = samples.filter(s => Math.min(minuteCount - 1, Math.floor(s.at / MINUTE_MS)) === i).map(s => s.ms).sort((a, b) => a - b);
      return {
        minute: i + 1, commands: ms.length,
        p50: round1(percentile(ms, 50)), p95: round1(percentile(ms, 95)), max: round1(ms[ms.length - 1] ?? 0),
        player: p.player, gm: p.gm, rss: p.rss,
      };
    });
    const failures = [...evaluateLoad(minutes, reconnects), ...errors.map(e => `ошибка бота: ${e}`)];
    return { ok: failures.length === 0, minutes, reconnects, failures, refusals };
  } finally {
    for (const b of bots) b.close();
    gm.close();
  }
}
