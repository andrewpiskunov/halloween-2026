import type { CopyableKind } from './abilities';
import type { AltarSide, Bundle, Ingredient, Owner } from './types';

/** Кто отправил команду: ведущий, игрок конкретной роли или сам сервер. */
export type Actor = { type: 'gm' } | { type: 'player'; roleKey: string } | { type: 'system' };

/** Окружение команды: время, автор, генератор id и случайность передаются снаружи. */
export interface Ctx { now: number; actor: Actor; newId: () => string; random: () => number }

export type Correction =
  | { field: 'gold'; delta: number }
  | { field: 'ingredient'; ingredient: Ingredient; delta: number }
  | { field: 'itemOwner'; itemId: string; owner: Owner }
  | { field: 'protection'; value: boolean }          // true: { by: 'gm', source: 'gm' }
  | { field: 'thorns'; value: boolean }
  | { field: 'curse'; value: boolean }
  | { field: 'discount'; value: boolean }
  | { field: 'abilityUsed'; value: boolean }         // false: вернуть применение в этом акте
  | { field: 'hostileAttempt'; value: boolean }      // false: снять отметку попытки
  | { field: 'guise'; name: string | null }          // null: снять облик
  | { field: 'side'; side: AltarSide | null }        // сторона свободного; null: снять выбор
  | { field: 'goal'; index: 0 | 1; value: boolean | null };   // null: считать цель по журналу

/** Параметры применения: дискриминант kind совпадает с видом роли автора. */
export type AbilityUse =
  | { kind: 'payAshWithGold'; recipeId: string }
  | { kind: 'focusFree' }
  | { kind: 'substituteIngredient'; recipeId: string; from: Ingredient; to: Ingredient }
  | { kind: 'buyCheap'; ingredient: Ingredient }
  | { kind: 'buyBulk'; take: [Ingredient, Ingredient] }
  | { kind: 'buyFromBank'; ingredient: Ingredient }
  | { kind: 'grow'; give: Ingredient }
  | { kind: 'swapIngredient'; give: Ingredient; take: Ingredient }
  | { kind: 'disassemble'; itemId: string; take: [Ingredient, Ingredient] }
  | { kind: 'reforge'; itemId: string; into: 'cleanse' | 'ward' | 'focus' }
  | { kind: 'sellToBank'; itemId: string }
  | { kind: 'protectSelf' }
  | { kind: 'protectOther'; target: string }
  | { kind: 'transferProtection'; from: string; to: string }
  | { kind: 'cleanseOther'; target: string }
  | { kind: 'discountOther'; target: string }
  | { kind: 'copyAbility'; copy: Extract<AbilityUse, { kind: CopyableKind }> }
  | { kind: 'stealGold'; target: string }
  | { kind: 'stealIngredient'; target: string; ingredient: Ingredient }
  | { kind: 'thorns'; target: string }
  | { kind: 'inspectInventory'; target: string }
  | { kind: 'sniffIngredient'; ingredient: Ingredient }
  | { kind: 'knowGold'; target: string }
  | { kind: 'askSide'; target: string }
  | { kind: 'askYesNo'; target: string; question?: string };

export type Command =
  | { type: 'session.setN'; n: number }
  | { type: 'session.toggleRole'; roleKey: string }
  | { type: 'player.bind'; code: string; telegramId: number }
  | { type: 'player.setPresent'; roleKey: string; present: boolean }
  | { type: 'session.open' }
  | { type: 'session.reset' }
  | { type: 'act.next' }
  | { type: 'clock.pause' } | { type: 'clock.resume' } | { type: 'clock.extend'; minutes: number }
  | { type: 'gm.announce'; text: string }
  | { type: 'gm.correct'; playerKey: string; change: Correction; reason: string }
  | { type: 'gm.rebind'; roleKey: string }
  | { type: 'gm.reissue' }                         // только actor system: новый код ведущего
  | { type: 'offer.create'; to: string; give: Bundle; get: Bundle; service?: boolean }
  | { type: 'offer.accept'; id: string } | { type: 'offer.decline'; id: string } | { type: 'offer.cancel'; id: string }
  | { type: 'offer.expire'; id: string }                       // только actor system
  | { type: 'shop.buy'; ingredient: Ingredient; count?: number }
  | { type: 'shop.craft'; recipeId: string }
  | { type: 'altar.contribute'; side: AltarSide; itemId?: string; gold?: number }
  | { type: 'lot.openBidding'; id: string }
  | { type: 'lot.sealedBids'; id: string }
  | { type: 'lot.bid'; id: string; amount: number }
  | { type: 'lot.close'; id: string }
  | { type: 'lot.buyout'; id: string }
  | { type: 'altar.withdraw'; contributionId: string }
  | { type: 'ability.use'; use: AbilityUse }
  | { type: 'item.use'; itemId: string; target?: string; guise?: string }
  | { type: 'consent.accept'; id: string }
  | { type: 'consent.decline'; id: string }
  | { type: 'consent.cancel'; id: string }          // автор или ведущий
  | { type: 'consent.expire'; id: string }          // только actor system
  | { type: 'player.chooseSide'; side: AltarSide }  // свободный, один раз, в act1 или act2
  | { type: 'session.close' }                       // ведущий, act3
  | { type: 'session.reveal' };                     // ведущий, closed

export type CommandType = Command['type'];

/**
 * Все типы команд объединения Command: компилятор проверит полноту списка.
 * Сервер принимает по WebSocket только эти типы; симулятор по ним считает покрытие.
 */
export const COMMAND_TYPES: Record<Command['type'], true> = {
  'session.setN': true, 'session.toggleRole': true, 'player.bind': true, 'player.setPresent': true,
  'session.open': true, 'session.reset': true, 'act.next': true, 'clock.pause': true, 'clock.resume': true, 'clock.extend': true,
  'gm.announce': true, 'gm.correct': true, 'gm.rebind': true, 'gm.reissue': true,
  'offer.create': true, 'offer.accept': true, 'offer.decline': true, 'offer.cancel': true, 'offer.expire': true,
  'shop.buy': true, 'shop.craft': true, 'altar.contribute': true, 'altar.withdraw': true,
  'lot.openBidding': true, 'lot.sealedBids': true, 'lot.bid': true, 'lot.close': true, 'lot.buyout': true,
  'ability.use': true, 'item.use': true,
  'consent.accept': true, 'consent.decline': true, 'consent.cancel': true, 'consent.expire': true,
  'player.chooseSide': true, 'session.close': true, 'session.reveal': true,
};
