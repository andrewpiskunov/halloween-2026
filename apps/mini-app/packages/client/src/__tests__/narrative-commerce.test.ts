import { expect, test, vi } from 'vitest';
import type { Bundle, PlayerView, NarrativeTrade } from '@fair/shared';
vi.mock('../narrative-navigation', () => ({ detailPage: {value: null}, openPage: vi.fn(), closePage: vi.fn() }));
import { tradeGoodsRows, validOwnGoods } from '../screens/NarrativeTrades';
const bundle = (changes: Partial<Bundle> = {}): Bundle => ({ gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [], ...changes });
const v = { me: { available: {gold: 3, ingredients: {ash: 1, moon: 0, dew: 2}, items: ['mine']}, items: [{id:'mine',kind:'relic',ref:'Корона пепла'}] }, act:1, recipes:[], public:{relics:[]}, hidden17:{narrative:{items:{}}} } as unknown as PlayerView;
test('предложение ограничено свободными своими ресурсами; пустой ответ допустим', () => {
  expect(validOwnGoods(bundle(),v)).toBe(true);
  expect(validOwnGoods(bundle({gold:4}),v)).toBe(false);
  expect(validOwnGoods(bundle({items:['other']}),v)).toBe(false);
  expect(validOwnGoods(bundle({items:['mine']}),v)).toBe(true);
  expect(validOwnGoods(bundle({ingredients:{ash:2,moon:0,dew:0}}),v)).toBe(false);
});
test('история сделки показывает изображение и имя уже переданной вещи по снимку', () => {
  const trade = {items:{gone:{kind:'relic',ref:'Корона пепла'}}} as unknown as NarrativeTrade;
  expect(tradeGoodsRows(bundle({items:['gone']}),v,trade)[0]).toMatchObject({name:'Корона пепла', image:'/assets/items/crown-of-ash.jpg'});
});
