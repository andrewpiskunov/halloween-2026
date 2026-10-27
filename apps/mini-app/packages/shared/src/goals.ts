// Каталог личных целей ролей: условие живёт в коде, текст цели остаётся в содержимом (role.goals).
import type { AltarSide } from './types';

/** Закрытый список условий (спецификация этапа 5, §4.1) и potionOnOther для Брама. */
export type GoalCondition =
  | { type: 'holdItem'; ref: string }                                   // вещь с этим ref в инвентаре при закрытии
  | { type: 'holdRelics'; count: number }                               // разных реликвий одновременно
  | { type: 'holdCraftedKinds'; count: number }                         // разных видов изготовленных вещей (potion/ward/focus/shape) в инвентаре
  | { type: 'holdKind'; kind: 'potion' | 'ward'; count: number }        // неиспользованных вещей вида
  | { type: 'holdClues'; count: 3 }
  | { type: 'goldAtLeast'; value: number }                              // player.gold (резервов при закрытии нет)
  | { type: 'craftedKinds'; count: number }                             // за игру изготовил разных видов (по журналу)
  | { type: 'soldCrafted'; count: number; distinctBuyers: number; minPrice: number }
  | { type: 'exchanges'; distinctPartners: number }                     // принятые сделки, где обе стороны отдали золото, ингредиент или вещь; партнёры разные
  | { type: 'servicePaid'; distinctPayers: number; minGold: number }    // сделки с service и золотом в мою сторону
  | { type: 'abilityUsed'; count: number; distinctTargets?: number }    // done-записи моей способности (копия Астры не считается)
  | { type: 'shapeSelf' }                                               // Камень облика к себе (запись item shape с target = author)
  | { type: 'cleansed' }                                                // с него сняли проклятие: запись potion (любой автор, в том числе он сам) или cleanseOther (Ада или Кнут) с removed.curse === true
  | { type: 'cleanseOthers'; distinctTargets: number }                  // снял шипы или проклятие с разных игроков своей способностью (removed.curse || removed.thorns)
  | { type: 'contributedGold'; side: AltarSide; value: number }         // лично вложил золота в алтарь (сумма вкладов, не забранных)
  | { type: 'contributedFocus'; side: AltarSide; count: number }
  | { type: 'contributedShard'; side: AltarSide }
  | { type: 'gaveKind'; kind: 'focus' | 'ward'; count: number; distinctReceivers: number }   // изготовил и передал сделкой разным игрокам
  | { type: 'protectedOthers'; distinctTargets: number }                // protectOther done на разных игроков
  | { type: 'potionOnOther' };                                          // Очищающее зелье на другого игрока: запись item potion, target !== author, done

const hold = (ref: string): GoalCondition => ({ type: 'holdItem', ref });
const focusTo = (side: AltarSide, count: number): GoalCondition => ({ type: 'contributedFocus', side, count });
const gold = (value: number): GoalCondition => ({ type: 'goldAtLeast', value });
const used = (count: number, distinctTargets?: number): GoalCondition =>
  ({ type: 'abilityUsed', count, ...(distinctTargets !== undefined ? { distinctTargets } : {}) });
const SHAPE_SELF: GoalCondition = { type: 'shapeSelf' };

/** roleKey → две цели в порядке role.goals (таблица §4.2). Тест сверяет ключи с содержимым и текст с видом условия. */
export const GOALS: Record<string, [GoalCondition, GoalCondition]> = {
  o1: [hold('Корона пепла'), focusTo('wake', 1)],
  o2: [hold('Лунный рог'), { type: 'potionOnOther' }],
  o3: [hold('Костяная флейта'), { type: 'exchanges', distinctPartners: 3 }],
  o4: [SHAPE_SELF, hold('Серебряная чешуя')],
  o5: [hold('Медный жезл'), focusTo('bind', 2)],
  o6: [{ type: 'craftedKinds', count: 3 }, { type: 'soldCrafted', count: 2, distinctBuyers: 2, minPrice: 1 }],
  o7: [gold(12), hold('Изумрудный глаз')],
  o8: [{ type: 'holdRelics', count: 2 }, used(1)],
  o9: [{ type: 'cleansed' }, hold('Клятвенный перстень')],
  o10: [{ type: 'cleanseOthers', distinctTargets: 1 }, hold('Семя леса')],
  o11: [hold('Серебряная чешуя'), { type: 'holdClues', count: 3 }],
  o12: [used(2, 2), { type: 'holdKind', kind: 'ward', count: 1 }],
  o13: [gold(12), { type: 'holdCraftedKinds', count: 2 }],
  o14: [{ type: 'servicePaid', distinctPayers: 2, minGold: 1 }, hold('Костяная флейта')],
  o15: [SHAPE_SELF, { type: 'holdKind', kind: 'potion', count: 2 }],
  o16: [{ type: 'gaveKind', kind: 'focus', count: 2, distinctReceivers: 2 }, { type: 'holdKind', kind: 'ward', count: 1 }],
  o17: [{ type: 'holdRelics', count: 3 }, SHAPE_SELF],
  n18: [hold('Колокольчик тишины'), focusTo('wake', 1)],
  n19: [hold('Молот-гаситель'), { type: 'exchanges', distinctPartners: 4 }],
  n20: [hold('Звёздная уздечка'), { type: 'gaveKind', kind: 'ward', count: 2, distinctReceivers: 2 }],
  r1: [{ type: 'servicePaid', distinctPayers: 3, minGold: 1 }, hold('Костяная флейта')],
  r2: [used(3, 3), hold('Изумрудный глаз')],
  r3: [hold('Ключ от ворот'), focusTo('wake', 1)],
  r4: [gold(12), hold('Весы оценщика')],
  r5: [SHAPE_SELF, hold('Медный жезл')],
  r6: [{ type: 'cleanseOthers', distinctTargets: 2 }, hold('Чётки молчания')],
  t1: [{ type: 'contributedGold', side: 'ship', value: 4 }, hold('Корона пепла')],
  t2: [hold('Серебряная чешуя'), gold(10)],
  t3: [{ type: 'contributedShard', side: 'ship' }, { type: 'protectedOthers', distinctTargets: 3 }],
  t4: [used(2, 2), hold('Ключ от ворот')],
};
