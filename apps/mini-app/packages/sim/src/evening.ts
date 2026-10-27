// Оркестратор прогона вечера (спецификация этапа 6, §2): боты, строгая очередь ходов, журнал прогона, проверки.
import {
  loadContent, type Command, type Content, type Event, type GameState, type GmView, type PlayerView,
} from '@fair/shared';
import { fetchCodes, openBot, type BotConn, type CmdOutcome } from './client';
import {
  checkCoverage, checkGoldLog, checkInvariantsAt, checkReplay, checkResponses, checkStart, checkViews, coverageOf,
} from './checks';
import { answerIncoming, playerAction, type Act, type TurnMemory } from './policy';
import { Rng } from './rng';
import { playEvening } from './scenario';

export interface EveningOptions {
  baseUrl: string;
  players: 12 | 30;
  seed: number;
  /** Состояние, восстановленное из журнала базы после прогона (§3.4); без него проверка пропускается. */
  replay?: () => Promise<GameState>;
  /** Журнал событий из базы для checkGold (§3.2); без него проверка пропускается. */
  events?: () => Promise<Event[]>;
  log?: (line: string) => void;
}

export interface CommandLog { turn: number; actor: string; cmd: Command; outcome: CmdOutcome; expectedRefusal?: string }
export interface CheckResult { name: string; ok: boolean; details: string[] }
export interface EveningResult {
  ok: boolean;
  checks: CheckResult[];
  commands: CommandLog[];
  finalState: GameState;
  snapshots: { label: string; state: GameState }[];
  timing: { p50: number; p95: number; max: number; totalMs: number };
  sizes: { player: number; gm: number };
  coverage: { missingCommands: string[]; missingAbilities: string[]; missingItems: string[] };
  questions: string[];
}

/** userId ведущего и основа userId игроков (§2.1); повторный вход после gm.rebind — от REBIND_USER_BASE. */
export const GM_USER_ID = 100;
export const PLAYER_USER_BASE = 1000;
export const REBIND_USER_BASE = 2000;
/** Пороги §3.5: предупреждение, не падение. */
const P95_LIMIT_MS = 300;
const PLAYER_VIEW_LIMIT = 256 * 1024;

/** Особый ход: сценарий сам делает действие хода и возвращает true; false — ход идёт по политике. */
export type Special = (view: PlayerView) => Promise<boolean>;

export interface TurnOptions {
  /** Вызывается в начале хода, до ответов на входящие. */
  before?: (view: PlayerView) => Promise<void>;
  special?: Special;
  /** Действие политики, которое в этом ходу нельзя (выбор стороны до второго круга); ход пропускается. */
  veto?: (cmd: Command) => boolean;
  /** Вызывается после действия хода (и его результата), до ожидания проекций. */
  after?: (cmd: Command, outcome: CmdOutcome) => Promise<void>;
}

/** Состояние прогона: боты, генератор, журнал, память ходов и общие операции сценария. */
export class Ctx {
  readonly rng: Rng;
  content!: Content;
  gm!: BotConn;
  readonly bots: Record<string, BotConn> = {};
  readonly mem: Record<string, TurnMemory> = {};
  readonly log: CommandLog[] = [];
  readonly snapshots: { label: string; state: GameState }[] = [];
  readonly viewChecks: CheckResult[] = [];
  readonly questions: string[] = [];
  /** Пробы, которые сценарий собирался сделать, но не нашёл повода. */
  readonly missedProbes: string[] = [];
  /** id вещи → вид на момент item.use: применённая вещь из состояния исчезает. */
  readonly itemKinds: Record<string, string> = {};
  /** Роли, чья способность в прошлом ходу получила отказ: в следующем ходу способность пропускается. */
  private readonly abilityRefused = new Set<string>();
  /** Все соединения за вечер, включая закрытые после gm.rebind: для размера проекций. */
  private readonly everyBot: BotConn[] = [];
  private lastSeq = 0;
  turnNo = 0;
  act: Act = 1;

  constructor(readonly opts: EveningOptions) {
    this.rng = new Rng(opts.seed);
  }

  gmState(): GameState {
    return (this.gm.view() as GmView).state;
  }

  view(role: string): PlayerView {
    return this.bots[role].view() as PlayerView;
  }

  /** Присутствующие роли в порядке состава. */
  present(): string[] {
    const s = this.gmState();
    return s.roster.filter(k => s.players[k]?.present);
  }

  /** Вход ведущего по коду ведущего; содержимое берётся из его проекции. */
  async loginGm(): Promise<void> {
    const codes = await fetchCodes(this.opts.baseUrl);
    this.gm = await this.authed('gm', GM_USER_ID, codes.gm);
    this.everyBot.push(this.gm);
    this.content = loadContent((this.gm.view() as GmView).content);
  }

  /** Вход игрока; успешный вход с ролью засчитывается как player.bind (§2.1). */
  async login(role: string, userId: number, code: string): Promise<void> {
    const bot = await this.authed(role, userId, code);
    if (bot.actor.type !== 'player' || bot.actor.roleKey !== role) throw new Error(`вход ${userId}: ожидалась роль ${role}`);
    this.bots[role] = bot;
    this.everyBot.push(bot);
  }

  private async authed(actor: string, userId: number, code: string): Promise<BotConn> {
    const started = performance.now();
    const bot = await openBot(this.opts.baseUrl, userId, code);
    const outcome: CmdOutcome = { ok: true, seq: bot.seq(), ms: performance.now() - started };
    this.lastSeq = Math.max(this.lastSeq, bot.seq());
    this.record({ turn: this.turnNo, actor, cmd: { type: 'player.bind', code, telegramId: userId }, outcome });
    return bot;
  }

  /** Закрывает соединение роли (перед gm.rebind). */
  drop(role: string): void {
    this.bots[role]?.close();
    delete this.bots[role];
  }

  closeAll(): void {
    for (const b of this.everyBot) b.close();
  }

  private record(entry: CommandLog): void {
    this.log.push(entry);
    const o = entry.outcome;
    const res = o.ok ? 'ok' : `${o.error}${o.detail ? ` (${o.detail})` : ''}`;
    this.opts.log?.(`#${entry.turn} ${entry.actor} ${entry.cmd.type} → ${res}${entry.expectedRefusal ? ` [проба: ${entry.expectedRefusal}]` : ''}`);
  }

  /** Команда от ведущего ('gm') или роли; результат в журнал прогона. */
  async send(actor: string, cmd: Command, expectedRefusal?: string): Promise<CmdOutcome> {
    const bot = actor === 'gm' ? this.gm : this.bots[actor];
    if (!bot) throw new Error(`нет соединения у ${actor}`);
    if (cmd.type === 'item.use') {
      const it = actor === 'gm' ? undefined : this.view(actor).me.items.find(i => i.id === cmd.itemId);
      if (it) this.itemKinds[cmd.itemId] = it.kind;
    }
    const outcome = await bot.send(cmd);
    if (outcome.ok && outcome.seq !== undefined) this.lastSeq = Math.max(this.lastSeq, outcome.seq);
    this.record({ turn: this.turnNo, actor, cmd, outcome, ...(expectedRefusal !== undefined ? { expectedRefusal } : {}) });
    return outcome;
  }

  /** Все соединения получили проекцию с seq последнего результата: сверять можно только после этого (§3.3). */
  async waitAll(): Promise<void> {
    await Promise.all([this.gm, ...Object.values(this.bots)].map(b => b.waitSeq(this.lastSeq)));
  }

  /** Ход ведущего: команды по порядку, затем ожидание проекций. */
  async gmTurn(cmds: Command[]): Promise<CmdOutcome[]> {
    this.turnNo++;
    const out: CmdOutcome[] = [];
    for (const cmd of cmds) out.push(await this.send('gm', cmd));
    await this.waitAll();
    return out;
  }

  /** Начало акта: память услуг сбрасывается; отмену и изъятие делает сценарий, не политика. */
  startAct(act: Act): void {
    this.act = act;
    for (const role of this.present()) {
      this.mem[role] ??= { abilityUsedAct: null, boughtPending: null, serviceDone: false, cancelDone: true, withdrawDone: true, bids: {} };
      Object.assign(this.mem[role], { serviceDone: false, cancelDone: true, withdrawDone: true });
    }
  }

  /** Ответы на входящие (предложения и просьбы согласия) по текущей проекции. */
  async answer(role: string): Promise<void> {
    for (const cmd of answerIncoming(this.view(role), this.rng)) await this.send(role, cmd);
    await this.waitAll();
  }

  /** Круг только из ответов: перед act.next и закрытием, чтобы просьбы не закрылись сменой акта. */
  async answersRound(): Promise<void> {
    for (const role of this.present()) {
      this.turnNo++;
      await this.answer(role);
    }
  }

  /**
   * Ход игрока (§2.2): ответы на входящие, затем одно действие — особое из сценария или по политике.
   * Применение способности считается потраченным только по состоянию (§2.4): отказ не сжигает акт.
   */
  async turn(role: string, t: TurnOptions = {}): Promise<void> {
    this.turnNo++;
    if (t.before) {
      await t.before(this.view(role));
      await this.waitAll();
    }
    await this.answer(role);
    const mem = this.mem[role];
    // Потрачено только то, что потратило состояние. После отказа (не хватает ингредиентов) ход отдаётся
    // политике целиком: иначе бот повторял бы отказ каждый ход и не дошёл бы до покупки недостающего.
    const skip = this.abilityRefused.delete(role);
    mem.abilityUsedAct = skip || this.gmState().players[role]?.abilityUsedInAct ? this.act : null;
    const view = this.view(role);
    if (t.special && await t.special(view)) {
      await this.waitAll();
      return;
    }
    const cmd = playerAction(view, this.act, mem, this.rng, this.gmState().roster);
    if (cmd && !t.veto?.(cmd)) {
      const outcome = await this.send(role, cmd);
      if (cmd.type === 'shop.buy' && !outcome.ok) mem.boughtPending = null;
      if (cmd.type === 'ability.use' && !outcome.ok) this.abilityRefused.add(role);
      await t.after?.(cmd, outcome);
    }
    await this.waitAll();
  }

  snapshot(label: string): void {
    this.snapshots.push({ label, state: this.gmState() });
  }

  /** Сверка проекций игроков с состоянием ведущего (§3.3) при равных seq. */
  async verifyViews(label: string): Promise<void> {
    await this.waitAll();
    const r = checkViews(this.bots, this.gmState(), this.content);
    this.viewChecks.push({ ...r, name: `views:${label}` });
  }

  async verifyStart(): Promise<void> {
    await this.waitAll();
    this.viewChecks.push(checkStart(this.bots, this.gmState(), this.content));
  }

  sizes(): { player: number; gm: number } {
    const player = Math.max(0, ...this.everyBot.filter(b => b.actor.type === 'player').map(b => b.maxViewBytes()));
    return { player, gm: this.gm.maxViewBytes() };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Прогон вечера против сервера по адресу opts.baseUrl: сценарий §2.3, проверки §3. */
export async function runEvening(opts: EveningOptions): Promise<EveningResult> {
  const started = performance.now();
  const ctx = new Ctx(opts);
  try {
    await playEvening(ctx);
    await ctx.waitAll();
    const finalState = ctx.gmState();

    const coverage = coverageOf(ctx.log, opts.players, finalState, ctx.itemKinds);
    const replayed = opts.replay ? await opts.replay() : undefined;
    const events = opts.events ? await opts.events() : undefined;
    const checks: CheckResult[] = [
      checkResponses(ctx.log, finalState),
      checkInvariantsAt(ctx.snapshots),
      ...ctx.viewChecks,
      checkCoverage(ctx.log, opts.players, finalState, ctx.itemKinds),
      { name: 'probes', ok: ctx.missedProbes.length === 0, details: ctx.missedProbes.map(p => `проба не сделана: ${p}`) },
      checkReplay(finalState, replayed),
      checkGoldLog(events, finalState),
    ];

    const ms = ctx.log.map(e => e.outcome.ms).sort((a, b) => a - b);
    const timing = {
      p50: round1(percentile(ms, 50)), p95: round1(percentile(ms, 95)), max: round1(ms[ms.length - 1] ?? 0),
      totalMs: Math.round(performance.now() - started),
    };
    const sizes = ctx.sizes();
    const questions = [...ctx.questions, ...coverage.notes];
    if (timing.p95 > P95_LIMIT_MS) questions.push(`Предупреждение: p95 ${timing.p95} мс выше ${P95_LIMIT_MS} мс`);
    if (sizes.player > PLAYER_VIEW_LIMIT) questions.push(`Предупреждение: проекция игрока ${sizes.player} байт больше ${PLAYER_VIEW_LIMIT}`);
    for (const c of checks) if (c.details.some(d => /пропущ/.test(d))) questions.push(`${c.name}: ${c.details.join('; ')}`);

    return {
      ok: checks.every(c => c.ok),
      checks,
      commands: ctx.log,
      finalState,
      snapshots: ctx.snapshots,
      timing,
      sizes,
      coverage: { missingCommands: coverage.missingCommands, missingAbilities: coverage.missingAbilities, missingItems: coverage.missingItems },
      questions,
    };
  } finally {
    ctx.closeAll();
  }
}
