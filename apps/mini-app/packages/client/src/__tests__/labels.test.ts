import { expect, test } from 'vitest';
import type { PlayerView } from '@fair/shared';
import { countsText, goldText, offerItem, plural, roman } from '../labels';

test('римские номера карт', () => {
  expect([1, 4, 9, 14, 19, 24, 28, 30].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XIX', 'XXIV', 'XXVIII', 'XXX']);
});

test('золото по-русски', () => {
  expect(goldText(1)).toBe('1 золотой');
  expect(goldText(2)).toBe('2 золотых');
  expect(goldText(6)).toBe('6 золотых');
  expect(goldText(21)).toBe('21 золотой');
  expect(plural(12, 'гость', 'гостя', 'гостей')).toBe('гостей');
  expect(plural(22, 'гость', 'гостя', 'гостей')).toBe('гостя');
});

test('вещь из предложения берётся из offerItems, неизвестная — undefined', () => {
  const v = { me: { items: [{ id: 'm1', kind: 'relic', ref: 'Семя леса', owner: { type: 'player', key: 'o1' } }] }, offerItems: { x9: { kind: 'focus', ref: 'focus' } } } as unknown as PlayerView;
  expect(offerItem('m1', v)?.ref).toBe('Семя леса');
  expect(offerItem('x9', v)).toEqual({ kind: 'focus', ref: 'focus' });
  expect(offerItem('zz', v)).toBeUndefined();
});

test('ресурсы словами для подтверждений', () => {
  expect(countsText({ gold: 2, ingredients: { ash: 1, moon: 1, dew: 1 } })).toBe('2 золотых, 1 пепел, 1 пыль, 1 роса');
  expect(countsText({ gold: 1, ingredients: { moon: 0 } })).toBe('1 золотой');
  expect(countsText({})).toBe('');
});
