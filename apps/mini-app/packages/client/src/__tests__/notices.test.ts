import { expect, test } from 'vitest';
import type { ActionRecord, ConsentRequestView, PlayerView } from '@fair/shared';
import { collectNotices } from '../notices';

const rec = (id: string, over: Partial<ActionRecord> = {}): ActionRecord => ({
  id, at: 0, act: 1, author: 'o8', target: 'o2', source: { type: 'ability', ability: 'stealGold' },
  outcome: 'done', hostile: true, effects: [], ...over,
});
const req = (id: string, over: Partial<ConsentRequestView> = {}): ConsentRequestView => ({
  id, author: 'o10', approvers: ['o2'], approved: [], status: 'pending', createdAt: 0, expiresAt: 300_000,
  action: { type: 'ability', ability: 'cleanseOther', target: 'o2' }, ...over,
});
const pv = (actions: ActionRecord[], requests: ConsentRequestView[], over: Partial<PlayerView> = {}) => ({
  phase: 'act1', announcements: [],
  me: { role: { key: 'o2', name: 'Брам' }, player: {} },
  others: [{ roleKey: 'o8', name: 'Никс' }, { roleKey: 'o10', name: 'Ада' }, { roleKey: 'o9', name: 'Эльмар' }],
  contacts: [], actions, requests, ...over,
}) as unknown as PlayerView;

test('первая проекция ничего не показывает, новые записи — показывают', () => {
  const first = collectNotices(null, pv([rec('1')], [req('q1')]));
  expect(first.texts).toEqual([]);
  const next = collectNotices(first.seen, pv([rec('1'), rec('2')], [req('q1'), req('q2', { author: 'o9' })]));
  expect(next.texts).toEqual(['Никс забрал у вас 1 золото', 'Новая просьба от Эльмара']);
});

test('автору: итог своей просьбы; своё исполненное действие без уведомления', () => {
  const mine = req('q3', { author: 'o2', approvers: ['o9'], action: { type: 'ability', ability: 'cleanseOther', target: 'o9' } });
  const s1 = collectNotices(null, pv([], [mine])).seen;
  const done = rec('5', { author: 'o2', target: 'o9', source: { type: 'ability', ability: 'cleanseOther' }, hostile: false, requestId: 'q3', removed: { curse: true, thorns: false } });
  const r = collectNotices(s1, pv([done], [{ ...mine, status: 'accepted', approved: ['o9'] }]));
  expect(r.texts).toEqual(['Эльмар согласился: проклятие снято']);
  const declined = collectNotices(s1, pv([], [{ ...mine, status: 'declined' }]));
  expect(declined.texts).toEqual(['Эльмар отказался']);
});

test('после показа итогов новое объявление ведущего приходит уведомлением', () => {
  const a1 = { at: 1, title: 'Итоги', text: 'Сердце спит' };
  const a2 = { at: 2, title: 'Танцы у костра', text: 'Все к костру' };
  const s1 = collectNotices(null, pv([], [], { phase: 'revealed', announcements: [a1] })).seen;
  expect(collectNotices(s1, pv([], [], { phase: 'revealed', announcements: [a1] })).texts).toEqual([]);
  const r = collectNotices(s1, pv([], [], { phase: 'revealed', announcements: [a1, a2] }));
  expect(r.texts).toEqual(['Объявление: Танцы у костра']);
  // до итогов объявления читают во вкладке «События», уведомления нет
  const s2 = collectNotices(null, pv([], [], { announcements: [a1] })).seen;
  expect(collectNotices(s2, pv([], [], { announcements: [a1, a2] })).texts).toEqual([]);
});
