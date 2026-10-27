import { describe, expect, test } from 'vitest';
import { altarResults, computeClosing } from '../engine/closing';
import type { GameState } from '../types';
import { Fair, allBut, buildAltar, checkInvariants, content, makeGame, wakeReady } from './helpers';

describe('computeClosing: алтари и исход', () => {
  test('собранный wake: готов, исход wake, достижение у стороны wake', () => {
    const f = new Fair(makeGame(12));
    wakeReady(f);
    checkInvariants(f.s);
    const altars = altarResults(f.s);
    expect(altars.map(a => a.side)).toEqual(['wake', 'bind', 'break']);
    expect(altars[0]).toEqual({ side: 'wake', shards: 3, focuses: 2, gold: 6, donors: 3, ready: true });
    expect(altars[1]).toEqual({ side: 'bind', shards: 0, focuses: 0, gold: 0, donors: 0, ready: false });

    const c = computeClosing(f.s, content, 777);
    expect(c.closedAt).toBe(777);
    expect(c.outcome).toBe('wake');
    expect(c.warnings).toEqual([]);
    expect(c.players.o1).toMatchObject({ outcome: true, side: 'wake' });
    expect(c.players.o5).toMatchObject({ outcome: false, side: 'bind' });
    // Грим свободный и стороны не выбрал.
    expect(c.players.o13).toMatchObject({ outcome: false, side: 'free' });
  });

  test('Грим выбрал wake (SideChosen) → получает исход wake', () => {
    const f = new Fair(makeGame(12));
    f.as('o13', { type: 'player.chooseSide', side: 'wake' });
    wakeReady(f);
    const c = computeClosing(f.s, content, 0);
    expect(c.players.o13).toMatchObject({ outcome: true, side: 'wake' });
  });

  test('неполный алтарь не готов: два дарителя золота', () => {
    const f = new Fair(makeGame(12));
    f.moveTo(f.find('shard', 'II').id, 'o1');
    f.moveTo(f.find('shard', 'III').id, 'o1');
    buildAltar(f, 'wake', 'o1', ['I', 'II', 'III'], ['o1', 'o2']);
    f.contribute('o1', 'wake', { gold: 2 });
    const [wake] = altarResults(f.s);
    expect(wake).toMatchObject({ gold: 6, donors: 2, ready: false });
    expect(computeClosing(f.s, content, 0).outcome).toBe('sleep');
  });

  test('два готовых алтаря → sleep, предупреждение, исход не получает никто', () => {
    const f = new Fair(makeGame(12));
    wakeReady(f);
    // bind: осколок IV из лота акта II, осколок V открывается в акте III.
    f.nextAct();
    f.winLot('o5', 2);
    f.nextAct();
    f.moveTo(f.find('shard', 'V').id, 'o5');
    buildAltar(f, 'bind', 'o5', ['IV', 'V'], ['o5', 'o6', 'o8']);
    // Третьего разного осколка командами не получить (осколков пять): ошибку данных изображает
    // поддельный осколок I на алтаре bind.
    const fake = { id: 'fake-shard', kind: 'shard' as const, ref: 'I', owner: { type: 'altar' as const, side: 'bind' as const } };
    const bind = f.s.altars.bind!;
    const s: GameState = {
      ...f.s,
      items: { ...f.s.items, [fake.id]: fake },
      altars: { ...f.s.altars, bind: { ...bind, contributions: [...bind.contributions, { id: 'fake-c', player: 'o5', item: fake.id }] } },
    };
    const altars = altarResults(s);
    expect(altars.filter(a => a.ready).map(a => a.side)).toEqual(['wake', 'bind']);
    const c = computeClosing(s, content, 0);
    expect(c.outcome).toBe('sleep');
    expect(c.warnings).toHaveLength(1);
    expect(c.warnings[0]).toBe('два готовых алтаря: Алтарь пробуждения, Алтарь подчинения');
    expect(Object.values(c.players).some(p => p.outcome)).toBe(false);
  });

  test('ничего не вложено → sleep без предупреждений, «Правды» нет', () => {
    const c = computeClosing(makeGame(12), content, 0);
    expect(c.outcome).toBe('sleep');
    expect(c.warnings).toEqual([]);
    expect(c.truthHolder).toBeUndefined();
    expect(Object.values(c.players).every(p => !p.outcome && !p.truth)).toBe(true);
  });
});

describe('computeClosing: «Правда», состав, исправления', () => {
  test('три улики у Корвина → truthHolder o11, truth только у него', () => {
    const f = new Fair(makeGame(30));
    f.nextAct();
    f.winLot('o11', 2);
    f.moveTo(f.find('clue', 'B').id, 'o11');
    f.moveTo(f.find('clue', 'C').id, 'o11');
    const c = computeClosing(f.s, content, 0);
    expect(c.truthHolder).toBe('o11');
    expect(c.players.o11.truth).toBe(true);
    expect(Object.entries(c.players).filter(([, p]) => p.truth).map(([k]) => k)).toEqual(['o11']);
  });

  test('две улики из трёх — «Правды» нет', () => {
    const f = new Fair(makeGame(30));
    f.moveTo(f.find('clue', 'B').id, 'o11');
    f.moveTo(f.find('clue', 'C').id, 'o11');
    expect(computeClosing(f.s, content, 0).truthHolder).toBeUndefined();
  });

  test('отсутствующий участник не попадает в players', () => {
    const s = makeGame(12, { present: allBut(12, ['o4']) });
    expect(s.roster).toContain('o4');
    const c = computeClosing(s, content, 0);
    expect(c.players).not.toHaveProperty('o4');
    expect(Object.keys(c.players)).toHaveLength(11);
    expect(Object.keys(c.players).sort()).toEqual(s.roster.filter(k => k !== 'o4').sort());
  });

  test('goalOverrides: не-null значение заменяет расчёт, null оставляет расчёт', () => {
    const f = new Fair(makeGame(12));
    wakeReady(f);
    // Расчёт: у Серафины нет «Короны пепла», Фокус в wake вложен.
    expect(computeClosing(f.s, content, 0).players.o1.goals).toEqual([false, true]);
    const withOverrides = (o: [boolean | null, boolean | null]): GameState =>
      ({ ...f.s, players: { ...f.s.players, o1: { ...f.s.players.o1, goalOverrides: o } } });
    expect(computeClosing(withOverrides([true, null]), content, 0).players.o1.goals).toEqual([true, true]);
    expect(computeClosing(withOverrides([null, false]), content, 0).players.o1.goals).toEqual([false, false]);
  });

  test('детерминизм: два вызова дают равные результаты и не меняют состояние', () => {
    const f = new Fair(makeGame(30));
    f.contribute('t1', 'ship', { gold: 4 });
    const before = JSON.stringify(f.s);
    const a = computeClosing(f.s, content, 5);
    const b = computeClosing(f.s, content, 5);
    expect(a).toEqual(b);
    expect(JSON.stringify(f.s)).toBe(before);
    expect(a.players.t1.goals[0]).toBe(true);
  });
});
