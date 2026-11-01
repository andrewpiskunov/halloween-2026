import {expect,test} from 'vitest';
import type {PlayerView,Recipe} from '@fair/shared';
import {craftPrice} from '../screens/Workshop';
const recipe={gold:1,cost:{ash:1}} as Recipe;
const view=(rulesVersion:2|undefined,discount=false,thorns=false)=>({hidden17:{rulesVersion},me:{player:{discount,thorns}}}) as unknown as PlayerView;
test('цена фонового заказа добавляет2 после дара/скидки; герой получает отдельный гонорар',()=>{
 expect(craftPrice(recipe,view(2))).toBe(3);
 expect(craftPrice({...recipe,gold:2},view(2))).toBe(4);
 expect(craftPrice(recipe,view(2),{artisan:true})).toBe(1);
 expect(craftPrice(recipe,view(2),{ashByGold:true})).toBe(4);
 expect(craftPrice(recipe,view(2),{freeWork:true})).toBe(2);
 expect(craftPrice(recipe,view(2,true,true),{freeWork:true})).toBe(3);
 expect(craftPrice(recipe,view(2,true),{ashByGold:true})).toBe(3);
 expect(craftPrice(recipe,view(2),{substitute:{from:'ash',to:'moon'}})).toBe(3);
 expect(craftPrice(recipe,view(undefined))).toBe(1);
 expect(craftPrice(recipe,view(undefined),{freeWork:true})).toBe(0);
});
