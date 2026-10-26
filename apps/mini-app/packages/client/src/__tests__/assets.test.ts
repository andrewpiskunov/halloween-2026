import { expect, test } from 'vitest';
import { itemImageUrl, portraitUrl, resourceImageUrl } from '../assets';

test('портрет роли — jpg по ключу', () => {
  expect(portraitUrl('o1')).toBe('/assets/portraits/o1.jpg');
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
