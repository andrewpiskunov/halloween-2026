import { expect, test } from 'vitest';
import { itemImageUrl, portraitUrl, resourceImageUrl } from '../assets';

test('все 30 портретов имеют версию содержимого против старого кэша', () => {
  const keys = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12', 'o13', 'o14', 'o15', 'o16', 'o17', 'n18', 'n19', 'n20', 't1', 't2', 't3', 't4', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  for (const key of keys) expect(portraitUrl(key)).toMatch(new RegExp('/assets/portraits/' + key + '\\.jpg\\?v=[a-f0-9]{12}$'));
});

test('картинки предметов по виду и ref', () => {
  expect(itemImageUrl({ kind: 'relic', ref: 'Корона пепла' })).toBe('/assets/items/crown-of-ash.jpg');
  expect(itemImageUrl({ kind: 'relic', ref: 'Неизвестная вещь' })).toBeUndefined();
  expect(itemImageUrl({ kind: 'shard', ref: 'IV' })).toBe('/assets/items/shard.jpg');
  expect(itemImageUrl({ kind: 'clue', ref: 'B' })).toBe('/assets/items/clue-B.jpg');
  expect(itemImageUrl({ kind: 'potion', ref: 'cleanse' })).toBe('/assets/items/cleanse.jpg');
  expect(itemImageUrl({ kind: 'shape', ref: 'shape' })).toBe('/assets/items/shape.jpg');
});

test('монета и ингредиенты', () => {
  expect(resourceImageUrl('gold')).toBe('/assets/items/gold.jpg');
  expect(resourceImageUrl('moon')).toBe('/assets/items/moon.jpg');
});
