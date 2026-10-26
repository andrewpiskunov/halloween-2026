import { expect, test } from 'vitest';
import type { GameState } from '@fair/shared';
import { ACT_MS, actPlan } from '../gm/clock';

const state = (phase: string, clock: Partial<GameState['clock']> = {}) =>
  ({ phase, clock: { actStartedAt: 0, pausedTotal: 0, ...clock } }) as unknown as GameState;

test('вне актов расписания нет', () => {
  expect(actPlan(state('setup'), 1000)).toBeNull();
  expect(actPlan(state('final'), 1000)).toBeNull();
});

test('акт I: через 10 минут осталось 15, конец на 35-й минуте вечера, подсказки ещё нет', () => {
  const p = actPlan(state('act1'), 10 * 60000)!;
  expect(p).toMatchObject({ act: 1, remainingMs: 15 * 60000, over: false, due: false, endsAtMinute: 35 });
  expect(p.todo[0]).toContain('акт II');
});

test('за три минуты до конца пора объявлять; после 25 минут акт перебран', () => {
  expect(actPlan(state('act2'), ACT_MS - 3 * 60000)!.due).toBe(true);
  const p = actPlan(state('act2'), ACT_MS + 60000)!;
  expect(p).toMatchObject({ over: true, due: true, remainingMs: -60000, endsAtMinute: 60 });
  expect(p.todo.join(' ')).toContain('свободным');
});

test('пауза останавливает отсчёт, продление на 5 минут добавляет 5 минут к остатку', () => {
  expect(actPlan(state('act3', { pausedAt: 4 * 60000 }), 20 * 60000)!.remainingMs).toBe(21 * 60000);
  // ClockExtended прибавляет к pausedTotal минуты продления.
  expect(actPlan(state('act3', { pausedTotal: 5 * 60000 }), 25 * 60000)!.remainingMs).toBe(5 * 60000);
  expect(actPlan(state('act3'), 0)!.todo[0]).toContain('Ярмарка закрывается');
});
