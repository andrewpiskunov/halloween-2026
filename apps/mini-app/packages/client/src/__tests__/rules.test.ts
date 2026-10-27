import { expect, test } from 'vitest';
import type { GameState, Item, Offer, PlayerView } from '@fair/shared';
import { GUISE_MAX, abilityTargets, canOffer, canPutOnAltar, canUseItem, correctableItems, phaseLabel, remainingMs } from '../rules';

const item = (over: Partial<Item>): Item => ({ id: 'i1', kind: 'shard', ref: 'I', owner: { type: 'player', key: 'o1' }, ...over });
const view = (act: 0 | 1 | 2 | 3, free: string[]) => ({ act, me: { available: { items: free } } }) as unknown as PlayerView;

test('верхняя полоса ведущего: фаза по-русски', () => {
  expect(phaseLabel('setup')).toBe('Подготовка');
  expect(phaseLabel('act1')).toBe('Акт 1');
  expect(phaseLabel('act3')).toBe('Акт 3');
  expect(phaseLabel('closed')).toBe('Закрыто');
  expect(phaseLabel('revealed')).toBe('Закрыто');
});

test('обратный отсчёт сделки и просьбы стоит на паузе', () => {
  const o = { expiresAt: 400_000 } as Offer;
  expect(remainingMs(o.expiresAt, { paused: false }, 100_000)).toBe(300_000);
  expect(remainingMs(o.expiresAt, { paused: true, pausedAt: 160_000 }, 500_000)).toBe(240_000);
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

/** Проекция игрока Сива (o15) в первом акте; остальное — по необходимости. */
function pv(over: { protection?: boolean; free?: string[]; target?: string; act?: 0 | 1 | 2 | 3 } = {}): PlayerView {
  return {
    act: over.act ?? 1, phase: over.act === 0 ? 'setup' : 'act1',
    me: {
      role: { key: 'o15', name: 'Сив' },
      player: { protection: over.protection ? { by: 'o9', source: 'ability' } : undefined },
      items: [], available: { items: over.free ?? ['p', 'w', 'f', 'r', 's', 'c', 'sh'] },
      ability: { target: over.target ?? 'other' },
    },
    others: [
      { roleKey: 'o2', name: 'Брам', title: 'Друид без леса', emoji: '🌿' },
      { roleKey: 'o6', name: 'Грета', title: 'Алхимик', emoji: '⚗️', guise: 'Тётушка Мэй' },
    ],
    offers: [{ id: 'of1', status: 'pending' }],
    requests: [{ id: 'q1', status: 'pending' }],
  } as unknown as PlayerView;
}

test('применять можно зелье, талисман и Камень; Фокус, реликвии, осколки и улики — нет', () => {
  const v = pv();
  expect(canUseItem(item({ id: 'p', kind: 'potion', ref: 'cleanse' }), v)).toEqual({ ok: true });
  expect(canUseItem(item({ id: 'sh', kind: 'shape', ref: 'shape' }), v)).toEqual({ ok: true });
  expect(canUseItem(item({ id: 'w', kind: 'ward', ref: 'ward' }), v)).toEqual({ ok: true });
  expect(canUseItem(item({ id: 'f', kind: 'focus', ref: 'focus' }), v)).toEqual({ ok: false, why: 'Кладётся на алтарь' });
  for (const kind of ['relic', 'shard', 'clue'] as const) {
    expect(canUseItem(item({ id: 'r', kind }), v).ok).toBe(false);
  }
});

test('талисман при защите и вещь в резерве не применяются', () => {
  expect(canUseItem(item({ id: 'w', kind: 'ward', ref: 'ward' }), pv({ protection: true }))).toEqual({ ok: false, why: 'Защита уже есть' });
  const v = pv({ free: [] });
  expect(canUseItem(item({ id: 'p', kind: 'potion', ref: 'cleanse', reservedFor: 'q1' }), v)).toEqual({ ok: false, why: 'обещано в просьбе' });
  expect(canUseItem(item({ id: 'p', kind: 'potion', ref: 'cleanse', reservedFor: 'of1' }), v)).toEqual({ ok: false, why: 'обещано в сделке' });
  expect(canUseItem(item({ id: 'p', kind: 'potion', ref: 'cleanse' }), pv({ act: 0 })).ok).toBe(false);
});

test('цели способности: «other» без себя, «any» с «Себе» первым, облик в подписи', () => {
  expect(abilityTargets(pv({ target: 'other' }))).toEqual([
    { roleKey: 'o2', label: 'Брам' },
    { roleKey: 'o6', label: 'Тётушка Мэй (Грета)' },
  ]);
  const any = abilityTargets(pv({ target: 'any' }));
  expect(any[0]).toEqual({ roleKey: 'o15', label: 'Себе' });
  expect(any.map(t => t.roleKey)).toEqual(['o15', 'o2', 'o6']);
  expect(abilityTargets(pv({ target: 'none' }))).toEqual([]);
  expect(GUISE_MAX).toBe(40);
});
