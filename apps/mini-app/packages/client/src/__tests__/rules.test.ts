import { expect, test } from 'vitest';
import type { GameState, Item, Offer, PlayerView } from '@fair/shared';
import { canOffer, canPutOnAltar, correctableItems, offerRemainingMs, phaseLabel } from '../rules';

const item = (over: Partial<Item>): Item => ({ id: 'i1', kind: 'shard', ref: 'I', owner: { type: 'player', key: 'o1' }, ...over });
const view = (act: 0 | 1 | 2 | 3, free: string[]) => ({ act, me: { available: { items: free } } }) as unknown as PlayerView;

test('верхняя полоса ведущего: фаза по-русски', () => {
  expect(phaseLabel('setup')).toBe('Подготовка');
  expect(phaseLabel('act1')).toBe('Акт 1');
  expect(phaseLabel('act3')).toBe('Акт 3');
  expect(phaseLabel('closed')).toBe('Закрыто');
  expect(phaseLabel('revealed')).toBe('Закрыто');
});

test('обратный отсчёт сделки стоит на паузе', () => {
  const o = { expiresAt: 400_000 } as Offer;
  expect(offerRemainingMs(o, { paused: false }, 100_000)).toBe(300_000);
  expect(offerRemainingMs(o, { paused: true, pausedAt: 160_000 }, 500_000)).toBe(240_000);
});

test('реликвии и улики на алтарь не предлагаются; скрытая до третьего акта вещь никуда', () => {
  const v1 = view(1, ['s', 'f', 'r', 'c', 'h', 'busy']);
  expect(canPutOnAltar(item({ id: 's', kind: 'shard' }), v1)).toBe(true);
  expect(canPutOnAltar(item({ id: 'f', kind: 'focus' }), v1)).toBe(true);
  expect(canPutOnAltar(item({ id: 'r', kind: 'relic' }), v1)).toBe(false);
  expect(canPutOnAltar(item({ id: 'c', kind: 'clue' }), v1)).toBe(false);
  expect(canOffer(item({ id: 'r', kind: 'relic' }), v1)).toBe(true);

  const hidden = item({ id: 'h', kind: 'shard', ref: 'V', hiddenUntilAct: 3 });
  expect(canOffer(hidden, v1)).toBe(false);
  expect(canPutOnAltar(hidden, v1)).toBe(false);
  const v3 = view(3, ['h']);
  expect(canOffer(hidden, v3)).toBe(true);
  expect(canPutOnAltar(hidden, v3)).toBe(true);

  // Обещанная в сделке вещь не свободна.
  expect(canOffer(item({ id: 'x' }), v1)).toBe(false);
});

test('в форме исправления только вещи у игроков', () => {
  const state = {
    items: {
      a: item({ id: 'a' }),
      b: item({ id: 'b', owner: { type: 'altar', side: 'wake' } }),
      c: item({ id: 'c', owner: { type: 'lot', id: 'l1' } }),
    },
  } as unknown as GameState;
  expect(correctableItems(state).map(i => i.id)).toEqual(['a']);
});
