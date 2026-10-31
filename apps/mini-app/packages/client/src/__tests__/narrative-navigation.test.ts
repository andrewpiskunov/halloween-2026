import { expect, test } from 'vitest';
import { parseNarrativeRoute } from '../narrative-navigation';

test('ссылка восстанавливает страницу вещи и раздел возврата', () => {
  expect(parseNarrativeRoute('#bag/item/odd%20id')).toEqual({ tab: 'bag', page: { kind: 'item', id: 'odd id' } });
  expect(parseNarrativeRoute('#workshop/recipe/focus')).toEqual({ tab: 'workshop', page: { kind: 'recipe', id: 'focus' } });
  expect(parseNarrativeRoute('#events')).toEqual({ tab: 'events', page: null });
});
test('чужой вид страницы и повреждённый адрес не открывают объект', () => {
  expect(parseNarrativeRoute('#gm/secret/all')).toBeNull();
  expect(parseNarrativeRoute('#bag/item/%xx')).toBeNull();
  expect(parseNarrativeRoute('#role/document/')).toBeNull();
});
