import { expect, test } from 'vitest';
import type { ActionRecord, GmView } from '@fair/shared';
import { actionLine, filterActions, requestLine } from '../gm/actions';

const at = (h: number, m: number) => new Date(2026, 9, 31, h, m).getTime();

const ROLES: Record<string, { name: string; skill: string }> = {
  o8: { name: 'Никс', skill: 'Ловкая рука' },
  o2: { name: 'Брам', skill: 'Рост' },
  o12: { name: 'Ива', skill: 'Шипы' },
  o6: { name: 'Грета', skill: 'Замена ингредиента' },
  o9: { name: 'Эльмар', skill: 'Охрана' },
  o1: { name: 'Серафина', skill: 'Дыхание крови' },
};

function view(actions: ActionRecord[]): GmView {
  return {
    kind: 'gm',
    state: { actions, requests: {}, players: {}, roster: Object.keys(ROLES) },
    content: { roles: Object.entries(ROLES).map(([key, r]) => ({ key, name: r.name, skill: r.skill })) },
    invites: [],
    abilities: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { kind: 'x', hostile: false, verbal: false, name: r.skill }])),
  } as unknown as GmView;
}

const steal: ActionRecord = {
  id: '10', at: at(12, 40), act: 2, author: 'o8', source: { type: 'ability', ability: 'stealGold' }, target: 'o2',
  outcome: 'done', hostile: true, effects: [{ type: 'goldMove', from: 'o2', to: 'o8', amount: 1 }],
};
const guard: ActionRecord = {
  id: '5', at: at(12, 30), act: 2, author: 'o9', source: { type: 'ability', ability: 'protectOther' }, target: 'o6',
  outcome: 'done', hostile: false, effects: [{ type: 'protection', player: 'o6', value: { by: 'o9', source: 'ability' } }],
};
const thornsBlocked: ActionRecord = {
  id: '12', at: at(12, 45), act: 2, author: 'o12', source: { type: 'ability', ability: 'thorns' }, target: 'o6',
  outcome: 'blocked', hostile: true, effects: [{ type: 'protection', player: 'o6', value: null }],
};
const focus: ActionRecord = {
  id: '3', at: at(12, 5), act: 2, author: 'o1', source: { type: 'ability', ability: 'focusFree' },
  outcome: 'done', hostile: false, effects: [],
};

test('строка кражи: акт, время, автор → цель, способность и суть', () => {
  expect(actionLine(steal, view([guard, steal]))).toBe('Акт II, 12:40. Никс → Брам: Ловкая рука, 1 золотой');
});

test('золото в журнале согласуется с числом', () => {
  const two: ActionRecord = { ...steal, id: '11', effects: [{ type: 'goldMove', from: 'o2', to: 'o8', amount: 2 }] };
  expect(actionLine(two, view([two]))).toBe('Акт II, 12:40. Никс → Брам: Ловкая рука, 2 золотых');
  const sold: ActionRecord = { ...focus, id: '13', effects: [{ type: 'gold', player: 'o1', delta: 2 }] };
  expect(actionLine(sold, view([sold]))).toBe('Акт II, 12:05. Серафина: Дыхание крови, +2 золотых');
  const paid: ActionRecord = { ...focus, id: '14', effects: [{ type: 'gold', player: 'o1', delta: -1 }] };
  expect(actionLine(paid, view([paid]))).toBe('Акт II, 12:05. Серафина: Дыхание крови, -1 золотой');
});

test('блокировка называет того, кто дал защиту', () => {
  expect(actionLine(thornsBlocked, view([guard, steal, thornsBlocked])))
    .toBe('Акт II, 12:45. Ива → Грета: Шипы отражены защитой (от Эльмара)');
});

test('без цели и без эффектов: только автор и способность', () => {
  expect(actionLine(focus, view([focus]))).toBe('Акт II, 12:05. Серафина: Дыхание крови');
});

test('защита от талисмана и от ведущего', () => {
  const ward: ActionRecord = {
    id: '4', at: at(12, 10), act: 2, author: 'o6', source: { type: 'item', kind: 'ward' }, outcome: 'done', hostile: false,
    effects: [{ type: 'itemRemoved', itemId: 'w1' }, { type: 'protection', player: 'o6', value: { by: 'o6', source: 'ward' } }],
  };
  expect(actionLine(ward, view([ward]))).toBe('Акт II, 12:10. Грета: Защитный талисман, защита');
  expect(actionLine(thornsBlocked, view([ward, thornsBlocked]))).toContain('Шипы отражены защитой (от талисмана)');
  // защиту дал ведущий исправлением: записи нет
  expect(actionLine(thornsBlocked, view([thornsBlocked]))).toContain('Шипы отражены защитой (от ведущего)');
});

test('фильтр: новые сверху, только враждебные, по игроку', () => {
  const all = [focus, guard, steal, thornsBlocked];
  expect(filterActions(all, {}).map(a => a.id)).toEqual(['12', '10', '5', '3']);
  expect(filterActions(all, { hostileOnly: true }).map(a => a.id)).toEqual(['12', '10']);
  expect(filterActions(all, { player: 'o6' }).map(a => a.id)).toEqual(['12', '5']);
  expect(filterActions(all, { player: 'o2', hostileOnly: true }).map(a => a.id)).toEqual(['10']);
  expect(filterActions(all, { player: 'o1', hostileOnly: true })).toEqual([]);
});

test('просьба словами для пульта: способность и вещь', () => {
  const v = view([]);
  (v.state as any).items = { p1: { id: 'p1', kind: 'item', ref: 'cleanse', owner: { type: 'player', key: 'o2' } } };
  const base = { author: 'o9', approvers: ['o6'], approved: [], status: 'pending' as const, createdAt: 0, expiresAt: 0 };
  expect(requestLine({ ...base, id: 'r1', action: { type: 'ability', use: { kind: 'cleanseOther', target: 'o6' } } }, v))
    .toBe('Эльмар → Грета: Охрана');
  expect(requestLine({ ...base, id: 'r2', author: 'o2', action: { type: 'item', itemId: 'p1', target: 'o6' } }, v))
    .toBe('Брам → Грета: Очищающее зелье');
  expect(requestLine({ ...base, id: 'r3', author: 'o2', action: { type: 'item', itemId: 'gone', target: 'o6', guise: 'Ворон' } }, v))
    .toBe('Брам → Грета: Камень облика «Ворон»');
});
