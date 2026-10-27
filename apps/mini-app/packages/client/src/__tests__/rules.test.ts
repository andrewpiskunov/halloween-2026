import { describe, expect, test } from 'vitest';
import type { GameState, Item, Offer, Phase, PlayerView } from '@fair/shared';
import { effectiveTab, tabsFor } from '../components/Tabs';
import { GUISE_MAX, abilityTargets, nextTab, canChooseSide, canOffer, canPutOnAltar, canUseItem, correctableItems, gameFrozen, leftText, phaseLabel, playerLeft, presenceConfirm, presenceEditable, remainingMs, tradesPaused } from '../rules';

const item = (over: Partial<Item>): Item => ({ id: 'i1', kind: 'shard', ref: 'I', owner: { type: 'player', key: 'o1' }, ...over });
const view = (act: 0 | 1 | 2 | 3, free: string[]) => ({ act, me: { available: { items: free } } }) as unknown as PlayerView;

test('верхняя полоса ведущего: фаза по-русски', () => {
  expect(phaseLabel('setup')).toBe('Подготовка');
  expect(phaseLabel('act1')).toBe('Акт 1');
  expect(phaseLabel('act3')).toBe('Акт 3');
  expect(phaseLabel('closed')).toBe('Закрыто');
  expect(phaseLabel('revealed')).toBe('Итоги');
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

test('в форме исправления вещи у игроков и на алтарях, но не в лотах', () => {
  const state = {
    items: {
      a: item({ id: 'a' }),
      b: item({ id: 'b', owner: { type: 'altar', side: 'wake' } }),
      c: item({ id: 'c', owner: { type: 'lot', id: 'l1' } }),
    },
  } as unknown as GameState;
  expect(correctableItems(state).map(i => i.id)).toEqual(['a', 'b']);
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

/** Проекция для выбора стороны: роль со стороной side, выбранная сторона chosen, фаза phase. */
const sidePv = (phase: PlayerView['phase'], side: string, chosen?: string) =>
  ({ phase, me: { role: { side }, player: { side: chosen } } }) as unknown as PlayerView;

test('выбрать сторону может свободный без выбора в первом и втором актах', () => {
  expect(canChooseSide(sidePv('act1', 'free'))).toBe(true);
  expect(canChooseSide(sidePv('act2', 'free'))).toBe(true);
  expect(canChooseSide(sidePv('act1', 'free', 'wake'))).toBe(false);
  expect(canChooseSide(sidePv('act3', 'free'))).toBe(false);
  expect(canChooseSide(sidePv('setup', 'free'))).toBe(false);
  expect(canChooseSide(sidePv('closed', 'free'))).toBe(false);
  expect(canChooseSide(sidePv('act1', 'wake'))).toBe(false);
});

test('после закрытия ярмарки игра заморожена', () => {
  expect(gameFrozen(sidePv('closed', 'wake'))).toBe(true);
  expect(gameFrozen(sidePv('revealed', 'wake'))).toBe(true);
  expect(gameFrozen(sidePv('act3', 'wake'))).toBe(false);
  expect(gameFrozen(sidePv('setup', 'wake'))).toBe(false);
});

test('«Итоги» открываются сами один раз на каждое закрытие', () => {
  // первая проекция в revealed: открыть «Итоги» и запомнить закрытие
  expect(nextTab('revealed', null, 'bag', 5000)).toEqual({ tab: 'results', shownFor: 5000 });
  // следующие проекции (и переподключение) того же закрытия: вкладку не трогать
  expect(nextTab('revealed', 5000, 'trades', 5000)).toEqual({ tab: 'trades', shownFor: 5000 });
  // после сброса игры ключ забывается, итоги следующей игры снова откроются сами
  expect(nextTab('act1', 5000, 'role', null)).toEqual({ tab: 'role', shownFor: null });
  expect(nextTab('revealed', null, 'role', 9000)).toEqual({ tab: 'results', shownFor: 9000 });
  // новое закрытие при запомненном старом ключе
  expect(nextTab('revealed', 5000, 'role', 9000)).toEqual({ tab: 'results', shownFor: 9000 });
});

test('вкладки: в revealed «Итоги» вместо «Событий», вне его — наоборот', () => {
  expect(effectiveTab('events', true)).toBe('results');
  expect(effectiveTab('bag', true)).toBe('bag');
  expect(effectiveTab('results', false)).toBe('role');
  expect(effectiveTab('events', false)).toBe('events');
  expect(tabsFor(true).map(t => t.key)).toEqual(['role', 'bag', 'trades', 'workshop', 'altars', 'results']);
  expect(tabsFor(false).map(t => t.key)).toEqual(['role', 'bag', 'trades', 'workshop', 'altars', 'events']);
});

describe('присутствие и пауза (этап 7)', () => {
  const lv = (phase: string, present: boolean, startIssuedAt?: number, paused = false) =>
    ({ phase, clock: { paused }, me: { player: { present, ...(startIssuedAt !== undefined ? { startIssuedAt } : {}) } } }) as unknown as PlayerView;

  test('playerLeft: только после открытия и при present = false', () => {
    expect(playerLeft(lv('setup', false))).toBe(false);
    expect(playerLeft(lv('act1', true, 1))).toBe(false);
    expect(playerLeft(lv('act2', false, 1))).toBe(true);
    expect(playerLeft(lv('act3', false))).toBe(true);
    expect(playerLeft(lv('closed', false, 1))).toBe(true);
  });

  test('полоса ушедшего: ушёл или ещё не отмечен', () => {
    expect(leftText(lv('act2', false, 1))).toBe('Ведущий отметил, что вы ушли. Если это ошибка, скажите ему');
    expect(leftText(lv('act1', false))).toBe('Ведущий ещё не отметил ваш приход. Скажите ему');
  });

  test('tradesPaused: пауза в акте', () => {
    expect(tradesPaused(lv('act1', true, 1, true))).toBe(true);
    expect(tradesPaused(lv('act3', true, 1, true))).toBe(true);
    expect(tradesPaused(lv('act1', true, 1, false))).toBe(false);
    expect(tradesPaused(lv('setup', true, undefined, true))).toBe(false);
    expect(tradesPaused(lv('closed', true, 1, true))).toBe(false);
  });

  test('подтверждения прихода и ухода на пульте дословно по §2.5', () => {
    expect(presenceConfirm('Брам', true, false)).toEqual({
      title: 'Отметить, что Брам пришёл?',
      text: 'Получит 6 золотых и стартовые ингредиенты. Вещи роли уже на рынке',
      okLabel: 'Отметить',
    });
    expect(presenceConfirm('Брам', true, true)).toEqual({
      title: 'Отметить, что Брам пришёл?', text: 'Вернётся с тем, что у него было. Цели снова считаются', okLabel: 'Отметить',
    });
    expect(presenceConfirm('Грета', true, false).title).toBe('Отметить, что Грета пришла?');
    expect(presenceConfirm('Грета', true, true).text).toBe('Вернётся с тем, что у неё было. Цели снова считаются');
    expect(presenceConfirm('Грета', false, true)).toEqual({
      title: 'Отметить, что Грета ушла?',
      text: 'Её сделки отменятся, вещи и вклады останутся, цели не считаются. Отметку можно снять',
      okLabel: 'Отметить',
    });
    expect(presenceConfirm('Брам', false, true)).toEqual({
      title: 'Отметить, что Брам ушёл?',
      text: 'Его сделки отменятся, вещи и вклады останутся, цели не считаются. Отметку можно снять',
      okLabel: 'Отметить',
    });
  });

  test('пульт: «пришёл» активен в подготовке и актах, но не после закрытия', () => {
    expect(['setup', 'act1', 'act2', 'act3', 'closed', 'revealed'].map(p => presenceEditable(p as Phase)))
      .toEqual([true, true, true, true, false, false]);
  });
});
