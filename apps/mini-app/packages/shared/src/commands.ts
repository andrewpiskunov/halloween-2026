import type { AltarSide, Bundle, Ingredient, Owner } from './types';

/** Кто отправил команду: ведущий, игрок конкретной роли или сам сервер. */
export type Actor = { type: 'gm' } | { type: 'player'; roleKey: string } | { type: 'system' };

/** Окружение команды: время, автор, генератор id и случайность передаются снаружи. */
export interface Ctx { now: number; actor: Actor; newId: () => string; random: () => number }

export type Correction =
  | { field: 'gold'; delta: number }
  | { field: 'ingredient'; ingredient: Ingredient; delta: number }
  | { field: 'itemOwner'; itemId: string; owner: Owner };

export type Command =
  | { type: 'session.setN'; n: number }
  | { type: 'session.toggleRole'; roleKey: string }
  | { type: 'player.bind'; code: string; telegramId: number }
  | { type: 'player.setPresent'; roleKey: string; present: boolean }
  | { type: 'session.open' }
  | { type: 'act.next' }
  | { type: 'clock.pause' } | { type: 'clock.resume' } | { type: 'clock.extend'; minutes: number }
  | { type: 'gm.announce'; text: string }
  | { type: 'gm.correct'; playerKey: string; change: Correction; reason: string }
  | { type: 'gm.rebind'; roleKey: string }
  | { type: 'offer.create'; to: string; give: Bundle; get: Bundle; service?: boolean }
  | { type: 'offer.accept'; id: string } | { type: 'offer.decline'; id: string } | { type: 'offer.cancel'; id: string }
  | { type: 'offer.expire'; id: string }                       // только actor system
  | { type: 'shop.buy'; ingredient: Ingredient; count?: number }
  | { type: 'shop.craft'; recipeId: string }
  | { type: 'altar.contribute'; side: AltarSide; itemId?: string; gold?: number }
  | { type: 'altar.withdraw'; contributionId: string };

export type CommandType = Command['type'];
