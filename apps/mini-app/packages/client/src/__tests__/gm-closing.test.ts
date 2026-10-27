import { expect, test } from 'vitest';
import type { Closing, GameState, Item } from '@fair/shared';
import { OUTCOME_TEXTS, OUTCOME_TITLES, altarChecklist, altarRows, closeBlock, playerSummary } from '../gm/closing';

const factions = [
  { id: 'wake', altar: 'Алтарь пробуждения' },
  { id: 'bind', altar: 'Алтарь подчинения' },
] as never;
const roles = [
  { key: 'o1', name: 'Серафина' }, { key: 'o2', name: 'Грим' }, { key: 'o3', name: 'Грета' }, { key: 'o4', name: 'Лира' },
] as never;

const item = (id: string, kind: Item['kind'], ref: string, side: 'wake' | 'bind'): Item => ({ id, kind, ref, owner: { type: 'altar', side } });

function state(extra: Partial<GameState> = {}): GameState {
  const items: Record<string, Item> = {
    s1: item('s1', 'shard', 'I', 'wake'), s2: item('s2', 'shard', 'II', 'wake'), s3: item('s3', 'shard', 'III', 'wake'),
    f1: item('f1', 'focus', 'focus', 'wake'), f2: item('f2', 'focus', 'focus', 'wake'),
    s4: item('s4', 'shard', 'IV', 'bind'), s5: item('s5', 'shard', 'IV', 'bind'), f3: item('f3', 'focus', 'focus', 'bind'),
  };
  return {
    phase: 'act3', roster: ['o1', 'o2', 'o3', 'o4'], lots: {}, items,
    players: { o1: { present: true }, o2: { present: true }, o3: { present: true, goalOverrides: [null, true] }, o4: { present: false } },
    altars: {
      wake: {
        side: 'wake', contributions: [
          { id: 'c1', player: 'o1', item: 's1' }, { id: 'c2', player: 'o1', item: 's2' }, { id: 'c3', player: 'o2', item: 's3' },
          { id: 'c4', player: 'o2', item: 'f1' }, { id: 'c5', player: 'o3', item: 'f2' },
          { id: 'c6', player: 'o1', gold: 2 }, { id: 'c7', player: 'o2', gold: 2 }, { id: 'c8', player: 'o3', gold: 2 },
        ],
      },
      bind: {
        side: 'bind', contributions: [
          { id: 'c9', player: 'o1', item: 's4' }, { id: 'c10', player: 'o2', item: 's5' }, { id: 'c11', player: 'o1', item: 'f3' },
          { id: 'c12', player: 'o1', gold: 3 }, { id: 'c13', player: 'o1', gold: 1 }, { id: 'c14', player: 'o2', gold: 0 },
        ],
      },
    },
    ...extra,
  } as unknown as GameState;
}

test('чек-лист: по алтарю четыре строки и отметка готовности по порогам движка', () => {
  const list = altarChecklist(state(), { factions });
  expect(list).toEqual([
    { side: 'wake', name: 'Алтарь пробуждения', ready: true, rows: ['осколков 3 из 3', 'фокусов 2 из 2', 'золота 6 из 6', 'дарителей золота 3 из 3'] },
    // один и тот же осколок дважды считается один раз; вклад без золота дарителем не считается
    { side: 'bind', name: 'Алтарь подчинения', ready: false, rows: ['осколков 1 из 3', 'фокусов 1 из 2', 'золота 4 из 6', 'дарителей золота 1 из 3'] },
  ]);
});

test('строки алтаря по готовому итогу', () => {
  expect(altarRows({ side: 'wake', shards: 2, focuses: 1, gold: 4, donors: 2, ready: false }))
    .toEqual(['осколков 2 из 3', 'фокусов 1 из 2', 'золота 4 из 6', 'дарителей золота 2 из 3']);
});

test('закрыть нельзя вне акта III и во время торга', () => {
  expect(closeBlock(state())).toBeNull();
  expect(closeBlock(state({ phase: 'act2' }))).toBe('Закрыть можно только в акте III');
  const lots = { l1: { id: 'l1', status: 'sealedBidding' } } as never;
  expect(closeBlock(state({ lots }))).toBe('Сначала закройте торг');
  const sold = { l1: { id: 'l1', status: 'sold' }, l2: { id: 'l2', status: 'announced' } } as never;
  expect(closeBlock(state({ lots: sold }))).toBeNull();
});

test('сводка по присутствующим в порядке состава: цели, исход, Правда, отметка ведущего', () => {
  const closing: Closing = {
    closedAt: 1, altars: [], outcome: 'wake', warnings: [], truthHolder: 'o2',
    players: {
      o3: { goals: [false, true], outcome: false, truth: false, side: 'free' },
      o1: { goals: [true, true], outcome: true, truth: false, side: 'wake' },
      o2: { goals: [true, false], outcome: false, truth: true, side: 'bind' },
    },
  };
  expect(playerSummary(closing, state(), { roles })).toEqual([
    'Серафина: цели 2/2, исход',
    'Грим: цели 1/2, Правда',
    'Грета: цели 1/2, отмечено ведущим',
  ]);
});

test('тексты исходов: пять заголовков и текстов', () => {
  expect(OUTCOME_TITLES.sleep).toBe('Сердце спит');
  expect(Object.keys(OUTCOME_TEXTS).sort()).toEqual(['bind', 'break', 'ship', 'sleep', 'wake']);
});
