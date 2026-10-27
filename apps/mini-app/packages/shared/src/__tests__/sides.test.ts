import { describe, expect, test } from 'vitest';
import { content, gm, makeGame, player, run } from './helpers';
import type { Actor, Command } from '../commands';
import type { GameState } from '../types';
import { viewFor, type PlayerView } from '../views';

function must(s: GameState, cmd: Command, actor: Actor, now = 0) {
  const r = run(s, cmd, actor, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error} ${r.detail ?? ''}`);
  return r;
}
const errorOf = (s: GameState, cmd: Command, actor: Actor) => {
  const r = run(s, cmd, actor);
  return r.ok ? 'ok' : r.error;
};

describe('выбор стороны свободными', () => {
  test('Грим (o13, free) в act1 выбирает wake: SideChosen, player.side; повторно invalid', () => {
    const s0 = makeGame(12);
    expect(content.roleByKey.o13.side).toBe('free');
    const r = must(s0, { type: 'player.chooseSide', side: 'wake' }, player('o13'), 100);
    expect(r.events).toEqual([{ type: 'SideChosen', at: 100, player: 'o13', side: 'wake' }]);
    expect(r.state.players.o13.side).toBe('wake');
    expect(errorOf(r.state, { type: 'player.chooseSide', side: 'bind' }, player('o13'))).toBe('invalid');
  });

  test('в act2 можно, в act3 нельзя', () => {
    const s1 = must(makeGame(12), { type: 'act.next' }, gm).state;
    expect(s1.phase).toBe('act2');
    expect(errorOf(s1, { type: 'player.chooseSide', side: 'break' }, player('o13'))).toBe('ok');
    const s2 = must(s1, { type: 'act.next' }, gm).state;
    expect(s2.phase).toBe('act3');
    expect(errorOf(s2, { type: 'player.chooseSide', side: 'break' }, player('o13'))).toBe('phase');
  });

  test('роль со стороной (Серафина, wake) → forbidden; ведущий → forbidden', () => {
    const s = makeGame(12);
    expect(errorOf(s, { type: 'player.chooseSide', side: 'bind' }, player('o1'))).toBe('forbidden');
    expect(errorOf(s, { type: 'player.chooseSide', side: 'bind' }, gm)).toBe('forbidden');
  });

  test('ship при составе 12 (Ящика нет) → not_found', () => {
    const s = makeGame(12);
    expect(s.altars.ship).toBeUndefined();
    expect(errorOf(s, { type: 'player.chooseSide', side: 'ship' }, player('o13'))).toBe('not_found');
  });

  test('сторону видит только сам игрок', () => {
    const s = must(makeGame(12), { type: 'player.chooseSide', side: 'wake' }, player('o13')).state;
    const own = viewFor(s, content, player('o13'), 0) as PlayerView;
    expect(own.me.player.side).toBe('wake');
    const other = viewFor(s, content, player('o1'), 0) as PlayerView;
    const grim = other.others.find(o => o.roleKey === 'o13')!;
    expect(grim).toBeDefined();
    expect(JSON.stringify(other.others)).not.toContain('"side"');
  });
});
