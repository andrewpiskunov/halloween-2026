import { describe, expect, test } from 'vitest';
import { defaultRoster } from '../engine/roster';
import { content, gm, newGame, player, run, system } from './helpers';
import type { GameState } from '../types';

function setN(n: number): GameState {
  const r = run(newGame(), { type: 'session.setN', n }, gm);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('состав', () => {
  test.each([[12, []], [17, []], [20, []], [23, ['r1', 'r2', 'r3']], [24, ['t1', 't2', 't3', 't4']], [30, ['t1', 't2', 't3', 't4', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']]] as [number, string[]][])
  ('состав при N=%i', (n, tail) => {
    const r = defaultRoster(content, n);
    expect(r).toHaveLength(n);
    expect(r.slice(0, Math.min(n, 20))).toEqual(content.roles.filter(x => x.pos <= Math.min(n, 20)).map(x => x.key));
    expect(r.slice(20)).toEqual(tail);
  });

  test('setN вне 12..30 отклоняется с invalid', () => {
    for (const n of [11, 31, 0, 12.5]) {
      expect(run(newGame(), { type: 'session.setN', n }, gm)).toMatchObject({ ok: false, error: 'invalid' });
    }
    const ok = run(newGame(), { type: 'session.setN', n: 12 }, gm);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.state.roster).toEqual(defaultRoster(content, 12));
      expect(Object.keys(ok.state.players).sort()).toEqual([...ok.state.roster].sort());
    }
  });

  test('setN и toggleRole от игрока отклоняются с forbidden', () => {
    expect(run(newGame(), { type: 'session.setN', n: 12 }, player('o1'))).toMatchObject({ ok: false, error: 'forbidden' });
    expect(run(setN(12), { type: 'session.toggleRole', roleKey: 'o1' }, player('o1'))).toMatchObject({ ok: false, error: 'forbidden' });
  });

  test('toggleRole убирает роль из roster и добавляет обратно; роль вне состава не привязывается по коду', () => {
    const s0 = setN(12);
    const off = run(s0, { type: 'session.toggleRole', roleKey: 'o6' }, gm);
    if (!off.ok) throw new Error(off.error);
    expect(off.state.roster).not.toContain('o6');
    expect(off.state.players.o6).toBeUndefined();
    expect(s0.roster).toContain('o6'); // вход не изменён

    expect(run(off.state, { type: 'player.bind', code: 'code-o6', telegramId: 555 }, system))
      .toMatchObject({ ok: false, error: 'forbidden' });
    expect(run(s0, { type: 'player.bind', code: 'code-o7', telegramId: 556 }, system))
      .toMatchObject({ ok: false, error: 'forbidden' });

    const on = run(off.state, { type: 'session.toggleRole', roleKey: 'o6' }, gm);
    if (!on.ok) throw new Error(on.error);
    expect(on.state.roster).toEqual(s0.roster);
    expect(on.state.players.o6).toMatchObject({ roleKey: 'o6', present: false, gold: 0 });

    const add = run(s0, { type: 'session.toggleRole', roleKey: 'o7' }, gm);
    if (!add.ok) throw new Error(add.error);
    expect(add.state.roster).toContain('o7');
    expect(run(add.state, { type: 'player.bind', code: 'code-o7', telegramId: 556 }, system).ok).toBe(true);

    expect(run(s0, { type: 'session.toggleRole', roleKey: 'zz' }, gm)).toMatchObject({ ok: false, error: 'not_found' });
  });

  test('bind: первый аккаунт привязан, второй по тому же коду получает forbidden, тот же аккаунт повторно ok без событий', () => {
    const first = run(setN(12), { type: 'player.bind', code: 'code-o1', telegramId: 1001 }, system);
    if (!first.ok) throw new Error(first.error);
    expect(first.events).toHaveLength(1);
    expect(first.state.players.o1.telegramId).toBe(1001);

    expect(run(first.state, { type: 'player.bind', code: 'code-o1', telegramId: 2002 }, system))
      .toMatchObject({ ok: false, error: 'forbidden' });

    const again = run(first.state, { type: 'player.bind', code: 'code-o1', telegramId: 1001 }, gm);
    expect(again).toMatchObject({ ok: true, events: [] });

    expect(run(first.state, { type: 'player.bind', code: 'nope', telegramId: 1 }, system))
      .toMatchObject({ ok: false, error: 'not_found' });
    expect(run(first.state, { type: 'player.bind', code: 'code-o2', telegramId: 1 }, player('o1')))
      .toMatchObject({ ok: false, error: 'forbidden' });
  });

  test('bind кодом ведущего (codes.gm) ставит gmTelegramId', () => {
    const s = setN(12);
    expect(s.gmCode).toBe('code-gm');
    const r = run(s, { type: 'player.bind', code: 'code-gm', telegramId: 42 }, system);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.gmTelegramId).toBe(42);
    expect(Object.values(r.state.players).every(p => p.telegramId === undefined)).toBe(true);
    expect(run(r.state, { type: 'player.bind', code: 'code-gm', telegramId: 43 }, system))
      .toMatchObject({ ok: false, error: 'forbidden' });
  });
});
