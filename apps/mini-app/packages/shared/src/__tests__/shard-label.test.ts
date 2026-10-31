import { expect, test } from 'vitest';
import { shardNumber } from '../shard-label';

test('римские идентификаторы осколков отображаются понятными номерами', () => {
  expect(['I', 'II', 'III', 'IV', 'V'].map(shardNumber)).toEqual(['1', '2', '3', '4', '5']);
  expect(shardNumber('?')).toBe('?');
});
