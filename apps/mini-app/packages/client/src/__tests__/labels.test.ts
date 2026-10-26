import { expect, test } from 'vitest';
import { goldText, plural, roman } from '../labels';

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
