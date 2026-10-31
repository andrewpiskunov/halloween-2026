import { expect, test } from 'vitest';
import type { ContentData, GmView } from '@fair/shared';
import { actNextPreview, lotsPreview } from '../gm/lots';

const content = {
  shards: [{ id: 'I', owner: 'o1' }, { id: 'II', owner: 'o5' }, { id: 'III', owner: 'o9' }, { id: 'IV' }],
  relics: [{ name: 'Жезл', owner: 'o2', wants: ['o3'] }, { name: 'Чаша', owner: 'o4', wants: ['o30'] }],
} as unknown as ContentData;

function view(roster: string[], presentKeys: string[], phase = 'setup', extra: object = {}): GmView {
  const players: Record<string, any> = {};
  for (const k of roster) players[k] = { present: presentKeys.includes(k) };
  return {
    kind: 'gm',
    state: { phase, roster, players, nPresent: presentKeys.length, lots: {}, ...extra },
    contentVersion: 'test',
    invites: [],
  } as unknown as GmView;
}

test('в лоты уходят вещи отсутствующих владельцев', () => {
  const v = view(['o1', 'o3', 'o10'], ['o1']);
  expect(lotsPreview(v, content)).toEqual(['Осколок 2', 'Осколок 3', 'Улика C', 'Улика B', 'Жезл']);
});

test('если все пришли, лотов нет; реликвия без желающих не уходит', () => {
  const all = ['o1', 'o2', 'o3', 'o4', 'o5', 'o9', 'o10', 'o16'];
  expect(lotsPreview(view(all, all), content)).toEqual([]);
  expect(lotsPreview(view(['o1', 'o4'], ['o1', 'o4']), content)).not.toContain('Чаша');
});

test('последствия акта: пополнение и осколок 5', () => {
  const v = view(['o14'], ['o14'], 'act2');
  const p = actNextPreview(v)!;
  expect(p.act).toBe('III');
  expect(p.lines.join(' ')).toContain('Осколок 5 откроется у Лиры');
  expect(actNextPreview(view(['o1'], [], 'act3'))).toBeNull();
});
