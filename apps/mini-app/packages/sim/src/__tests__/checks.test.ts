import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Command, GameState } from '@fair/shared';
import {
  ALLOWED_FAIL_PREFIXES, ALLOWED_FAIL_REASONS, abilityWorked, actNextLabel, checkClosing, checkCoverage, checkGoldLog, checkInvariantsAt, checkReplay,
  checkResponses, checkStart, checkViews,
} from '../checks';
import type { BotConn } from '../client';
import type { CmdOutcome } from '../client';
import type { CommandLog } from '../evening';
import { content, Game } from './fixture';

const entry = (actor: string, cmd: Command, outcome: Partial<CmdOutcome>, expectedRefusal?: string): CommandLog =>
  ({ turn: 1, actor, cmd, outcome: { ok: false, ms: 1, ...outcome }, ...(expectedRefusal ? { expectedRefusal } : {}) });

describe('checkResponses', () => {
  test('допустимые отказы и пробы проходят', () => {
    const r = checkResponses([
      entry('o1', { type: 'shop.buy', ingredient: 'ash' }, { error: 'insufficient' }),
      entry('o1', { type: 'shop.buy', ingredient: 'ash' }, { ok: true, seq: 3 }),
      entry('o2', { type: 'lot.close', id: 'l' }, { error: 'forbidden' }, 'forbidden'),
      entry('o14', { type: 'ability.use', use: { kind: 'discountOther', target: 'o1' } }, { error: 'invalid', detail: 'у цели уже есть скидка' }),
      entry('gm', { type: 'lot.close', id: 'l' }, { error: 'invalid', detail: 'закрытые ставки не идут' }),
    ]);
    expect(r).toEqual({ name: 'responses', ok: true, details: [] });
  });

  test('forbidden вне пробы, чужой invalid, internal и проба с другим кодом падают', () => {
    const r = checkResponses([
      entry('o1', { type: 'session.close' }, { error: 'forbidden' }),
      entry('o9', { type: 'ability.use', use: { kind: 'protectOther', target: 'o1' } }, { error: 'invalid', detail: 'у цели уже есть скидка' }),
      entry('o1', { type: 'shop.buy', ingredient: 'ash' }, { error: 'internal' }),
      entry('o2', { type: 'lot.close', id: 'l' }, { ok: true, seq: 5 }, 'forbidden'),
      entry('o1', { type: 'lot.close', id: 'l' }, { error: 'invalid', detail: 'закрытые ставки не идут' }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.details).toHaveLength(5);
  });

  test('ведущий строг: любой отказ ему — ошибка, кроме позднего lot.close', () => {
    const r = checkResponses([
      entry('gm', { type: 'gm.correct', playerKey: 'o1', change: { field: 'gold', delta: -99 }, reason: 'x' }, { error: 'insufficient' }),
      entry('gm', { type: 'lot.close', id: 'l' }, { error: 'phase' }),
      entry('gm', { type: 'lot.close', id: 'l' }, { error: 'invalid', detail: 'закрытые ставки не идут' }),
    ]);
    expect(r.details).toHaveLength(2);
    expect(r.details.every(d => d.startsWith('отказ ведущему'))).toBe(true);
  });

  test('причины невыполненных просьб: допустимые проходят, прочие падают', () => {
    const g = new Game(12);
    const base = { approvers: ['o1'], approved: ['o1'], status: 'failed' as const, createdAt: 0, expiresAt: 1 };
    const state: GameState = {
      ...g.s,
      requests: {
        a: { ...base, id: 'a', author: 'o14', action: { type: 'ability', use: { kind: 'discountOther', target: 'o1' } }, reason: 'условия изменились' },
        b: { ...base, id: 'b', author: 'o17', action: { type: 'ability', use: { kind: 'copyAbility', copy: { kind: 'grow', give: 'dew' } } }, reason: 'нет ингредиента: dew' },
        c: { ...base, id: 'c', author: 'o2', action: { type: 'item', itemId: 'x', target: 'o1' }, reason: 'нельзя' },
      },
    };
    const r = checkResponses([], state);
    expect(r.details).toHaveLength(1);
    expect(r.details[0]).toContain('o2');
  });

  test('допустимые причины взяты из движка', () => {
    const dir = fileURLToPath(new URL('../../../shared/src/engine/', import.meta.url));
    const source = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(dir + f, 'utf8')).join('\n');
    for (const s of ALLOWED_FAIL_REASONS) expect(source, s).toContain(`'${s}'`);
    for (const p of ALLOWED_FAIL_PREFIXES) expect(source, p).toContain(`\`${p}`);
  });
});

describe('checkCoverage', () => {
  test('недостающие команды, способности и вещи; выкуп при 30 не обязателен', () => {
    const g = new Game(12);
    const log = [entry('o1', { type: 'item.use', itemId: 'p1' }, { ok: true, seq: 2 })];
    const r = checkCoverage(log, 12, g.s, { p1: 'potion' });
    expect(r.ok).toBe(false);
    expect(r.details).toContain('команда без ok: lot.buyout');
    expect(r.details).toContain('команда без ok: session.open');
    expect(r.details).not.toContain('команда без ok: item.use');
    expect(r.details).not.toContain('команда без ok: offer.expire');
    expect(r.details).toContain('способность не сработала: o1:payAshWithGold');
    expect(r.details).toContain('вещь не применена: ward');
    expect(r.details).not.toContain('вещь не применена: potion');
    expect(checkCoverage(log, 30, g.s).details).not.toContain('команда без ok: lot.buyout');
  });

  test('враждебная способность, отражённая защитой, засчитана; невраждебная blocked — нет', () => {
    const g = new Game(12);
    const rec = (author: string, ability: 'stealGold' | 'protectOther') => ({
      id: '1', at: 1, act: 3 as const, author, source: { type: 'ability' as const, ability }, outcome: 'blocked' as const, hostile: true, effects: [],
    });
    const s = { ...g.s, actions: [rec('r4', 'stealGold'), rec('t3', 'protectOther')] };
    expect(abilityWorked(s, 'r4', 'stealGold')).toBe(true);
    expect(abilityWorked(s, 't3', 'protectOther')).toBe(false);
  });

  test('перенос защиты без защитника — пояснение, а не пропуск покрытия', () => {
    const g = new Game(12);
    g.s = { ...g.s, players: { ...g.s.players, o9: { ...g.s.players.o9, present: false } } };
    const r = checkCoverage([], 12, g.s);
    expect(r.details).not.toContain('способность не сработала: o16:transferProtection');
    expect(r.details.some(d => d.includes('нет защитника'))).toBe(true);
  });
});

describe('сверка проекций: набор ботов', () => {
  const botOf = (g: Game, key: string): BotConn => ({
    actor: { type: 'player', roleKey: key }, view: () => g.view(key), seq: () => g.s.seq,
    send: async () => ({ ok: true, ms: 0 }), waitSeq: async () => {}, content: () => null, maxViewBytes: () => 0, close: () => {},
  });

  test('бот без присутствующей роли или роль без бота — ошибка', () => {
    const g = new Game(12);
    const bots = Object.fromEntries(g.s.roster.map(k => [k, botOf(g, k)]));
    expect(checkViews(bots, g.s, content).details.filter(d => d.startsWith('боты'))).toEqual([]);
    const { o1: _drop, ...without } = bots;
    expect(checkViews(without, g.s, content).ok).toBe(false);
    expect(checkStart(without, g.s, content).details[0]).toMatch(/^боты .* не совпадают/);
  });
});

describe('снимки, воспроизведение, золото', () => {
  test('нет пары вокруг act.next — проверка падает; пара есть — проходит', () => {
    const g = new Game(12);
    expect(checkInvariantsAt([{ label: 'setup', state: g.s }]).ok).toBe(false);
    const before = g.s;
    g.must({ type: 'act.next' }, 'gm');
    const mid = g.s;
    g.must({ type: 'act.next' }, 'gm');
    const r = checkInvariantsAt([
      { label: actNextLabel(2, 'до'), state: before }, { label: actNextLabel(2, 'после'), state: mid },
      { label: actNextLabel(3, 'до'), state: mid }, { label: actNextLabel(3, 'после'), state: g.s },
    ]);
    expect(r).toEqual({ name: 'invariants', ok: true, details: [] });
  });

  test('без источников проверки помечены пропущенными; расхождение называет ключи', () => {
    const g = new Game(12);
    expect(checkReplay(g.s).details[0]).toMatch(/пропущ/);
    expect(checkGoldLog(undefined, g.s).details[0]).toMatch(/пропущ/);
    expect(checkReplay(g.s, structuredClone(g.s)).ok).toBe(true);
    const r = checkReplay(g.s, { ...g.s, seq: g.s.seq + 1 });
    expect(r.ok).toBe(false);
    expect(r.details[0]).toContain('seq');
  });
});

describe('checkClosing', () => {
  const closed = () => {
    const g = new Game(12);
    g.must({ type: 'act.next' }, 'gm');
    g.must({ type: 'act.next' }, 'gm');
    g.must({ type: 'session.close' }, 'gm');
    return g.s;
  };

  test('итоги совпадают с computeClosing; ожидания исхода и «Правды» сверяются', () => {
    const s = closed();
    expect(checkClosing(s, content)).toEqual({ name: 'closing', ok: true, details: [] });
    const r = checkClosing(s, content, { outcome: 'wake', truth: 'o10' });
    expect(r.ok).toBe(false);
    expect(r.details.join('\n')).toMatch(/исход sleep, ожидался wake/);
    expect(r.details.join('\n')).toMatch(/«Правда» ни у кого, ожидалась у o10/);
  });

  test('подменённые итоги и отсутствие итогов падают', () => {
    const s = closed();
    const forged: GameState = { ...s, closing: { ...s.closing!, outcome: 'wake' } };
    expect(checkClosing(forged, content).details).toEqual(['итоги в состоянии расходятся с computeClosing']);
    expect(checkClosing({ ...s, closing: undefined }, content).ok).toBe(false);
  });
});
