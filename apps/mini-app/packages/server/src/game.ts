import { randomBytes, randomUUID } from 'node:crypto';
import {
  execute, initialState, reduce,
  type Actor, type Command, type Content, type ErrorCode, type Event, type GameState,
} from '@fair/shared';
import type { EventStore } from './store';

export interface GameOpts { now: () => number; newId: () => string; random: () => number }
export type SubmitResult = { ok: true; seq: number } | { ok: false; error: ErrorCode; detail?: string };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 12;

/** Случайный код из A–Za–z0–9; байты ≥ 248 отбрасываются, чтобы не было перекоса по модулю 62. */
export function randomCode(length = CODE_LENGTH): string {
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 248 && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** Уникальные коды для всех ролей и ведущего (ключ 'gm'). */
function generateCodes(content: Content): Record<string, string> {
  const codes: Record<string, string> = {};
  const used = new Set<string>();
  for (const key of ['gm', ...content.roles.map(r => r.key)]) {
    let code: string;
    do code = randomCode(); while (used.has(code));
    used.add(code);
    codes[key] = code;
  }
  return codes;
}

/** Игра в памяти: состояние, строгая очередь команд, журнал и подписчики. */
export class Game {
  private current: GameState;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly subscribers = new Set<(state: GameState) => void>();

  private constructor(
    private readonly store: EventStore,
    private readonly content: Content,
    private readonly opts: GameOpts,
    state: GameState,
  ) {
    this.current = state;
  }

  /** Пустой журнал → новая сессия с кодами; иначе состояние восстанавливается проигрыванием журнала. */
  static open(store: EventStore, content: Content, opts: GameOpts): Game {
    let events = store.all();
    if (events.length === 0) {
      const codes = generateCodes(content);
      events = store.append([{ type: 'SessionCreated', at: opts.now(), codes }]);
      store.saveMeta('gmCode', codes.gm);
    }
    // Основа без кодов: SessionCreated из журнала сам выставит приглашения и код ведущего.
    const base = initialState(content, {});
    const state = events.reduce((s, e) => reduce(s, content, e), base);
    return new Game(store, content, opts, state);
  }

  state(): GameState {
    return this.current;
  }

  gmCode(): string {
    return this.current.gmCode;
  }

  /**
   * Выполняет команду строго по одной; повтор cmdId успешной команды возвращает сохранённый результат.
   * Неудачи не сохраняются: ничего не применено, поэтому повтор выполняется заново
   * (например, привязка после того, как ведущий включил роль в состав).
   */
  submit(cmdId: string, cmd: Command, actor: Actor): Promise<SubmitResult> {
    const run = this.queue.then(() => this.apply(cmdId, cmd, actor));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private apply(cmdId: string, cmd: Command, actor: Actor): SubmitResult {
    const saved = this.store.getResult(cmdId) as SubmitResult | undefined;
    if (saved) return saved;

    const before = this.current;
    const r = execute(before, this.content, cmd, {
      now: this.opts.now(), actor, newId: this.opts.newId, random: this.opts.random,
    });
    if (!r.ok) return r.detail === undefined ? { ok: false, error: r.error } : { ok: false, error: r.error, detail: r.detail };

    // События и результат пишутся одной транзакцией: после сбоя повтор cmdId не применит команду дважды.
    const okResult = (stored: Event[]): SubmitResult => ({ ok: true, seq: stored.length ? stored[stored.length - 1].seq! : before.seq });
    const stored = this.store.commit(r.events, cmdId, okResult);
    this.current = stored.reduce((s, e) => reduce(s, this.content, e), before);
    if (stored.length) this.notify();
    return okResult(stored);
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try { fn(this.current); } catch (err) { console.error('Ошибка подписчика игры', err); }
    }
  }

  subscribe(fn: (state: GameState) => void): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  /** Закрывает просроченные предложения; вызывать раз в секунду. На паузе сроки стоят (спек §10). */
  tick(): void {
    if (this.current.clock.pausedAt !== undefined) return;
    const now = this.opts.now();
    for (const o of Object.values(this.current.offers)) {
      if (o.status === 'pending' && o.expiresAt <= now) {
        this.submit('expire:' + o.id, { type: 'offer.expire', id: o.id }, { type: 'system' })
          .catch(err => console.error('Ошибка истечения предложения', err));
      }
    }
  }

  actorFor(telegramId: number): Actor | undefined {
    const s = this.current;
    if (s.gmTelegramId === telegramId) return { type: 'gm' };
    const roleKey = s.roster.find(k => s.players[k]?.telegramId === telegramId);
    return roleKey ? { type: 'player', roleKey } : undefined;
  }

  /** Привязывает аккаунт по коду приглашения и возвращает его роль (или undefined). */
  async bindByCode(code: string, telegramId: number): Promise<Actor | undefined> {
    // Каждое открытие ссылки — новая команда: движок сам идемпотентен для того же аккаунта,
    // а сохранённый результат прошлой привязки не должен скрывать изменения состава.
    await this.submit(`bind:${code}:${telegramId}:${randomUUID()}`, { type: 'player.bind', code, telegramId }, { type: 'system' });
    return this.actorFor(telegramId);
  }
}
