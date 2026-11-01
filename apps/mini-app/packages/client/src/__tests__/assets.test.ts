import { expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { Content, Item } from '@fair/shared';
import { documentImageUrl, itemImageUrl, portraitUrl, resourceImageUrl } from '../assets';
import { SPECIAL_NAMES } from '../screens/HiddenCommon';

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

test('каждый штатный предмет, ресурс и документ ссылается на существующее изображение', () => {
  const content: Content = JSON.parse(readFileSync(new URL('../../../../../../docs/design/game-data-v0.2.json', import.meta.url), 'utf8'));
  const narrative: { documents: { id: string }[] } = JSON.parse(readFileSync(new URL('../../../../../../docs/design/gm-book/narrative-17.json', import.meta.url), 'utf8'));
  const items: Pick<Item, 'kind' | 'ref'>[] = [
    ...content.relics.map(r => ({ kind: 'relic' as const, ref: r.name })),
    ...content.shards.map(s => ({ kind: 'shard' as const, ref: s.id })),
    ...content.clues.map(c => ({ kind: 'clue' as const, ref: c.id })),
    ...content.recipes.map(r => ({ kind: (r.id === 'cleanse' ? 'potion' : r.id) as Item['kind'], ref: r.id })),
    ...Object.keys(SPECIAL_NAMES).map(ref => ({ kind: 'special' as const, ref })),
  ];
  const check = (label: string, url: string | undefined) => {
    expect.soft(url, label).toBeDefined();
    if (url) expect.soft(existsSync(new URL(`../../public${url}`, import.meta.url)), label).toBe(true);
  };
  for (const item of items) check(`${item.kind}:${item.ref}`, itemImageUrl(item));
  for (const resource of ['gold', 'ash', 'moon', 'dew'] as const) check(resource, resourceImageUrl(resource));
  for (const doc of [...narrative.documents, { id: 'memory:joining' }]) check(doc.id, documentImageUrl(doc.id));
});
