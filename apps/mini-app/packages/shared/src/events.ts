import type { Correction } from './commands';
import type { Altar, AltarSide, Announcement, Bundle, Contribution, Counts, Ingredient, Item, Lot, Offer, OfferStatus, Player } from './types';

/** Общие поля события: время факта и номер в журнале (проставляется при записи). */
export interface EventBase { at: number; seq?: number }

/** Сессия создана с кодами приглашений: по roleKey для всех 30 ролей и ключ 'gm'. */
export interface SessionCreated extends EventBase { type: 'SessionCreated'; codes: Record<string, string> }
/** Ведущий сбросил игру: состояние начальное с новыми кодами, ведущий остаётся привязанным. */
export interface SessionReset extends EventBase { type: 'SessionReset'; codes: Record<string, string>; gmTelegramId?: number }
/** Ведущий задал N, состав пересчитан по правилу 6.1. */
export interface RosterSet extends EventBase { type: 'RosterSet'; roster: string[] }
/** Роль вручную убрана из состава или возвращена в него. */
export interface RoleToggled extends EventBase { type: 'RoleToggled'; roleKey: string; inRoster: boolean }
/** Аккаунт Telegram привязан к роли или к ведущему ('gm'). */
export interface PlayerBound extends EventBase { type: 'PlayerBound'; roleKey: string | 'gm'; telegramId: number }
/** Ведущий отметил явку игрока. */
export interface PresenceSet extends EventBase { type: 'PresenceSet'; roleKey: string; present: boolean }
/** Ярмарка открыта: всё начальное состояние первого акта. */
export interface FairOpened extends EventBase {
  type: 'FairOpened';
  nPresent: number;
  players: Record<string, Player>;
  items: Record<string, Item>;
  lots: Record<string, Lot>;
  workshop: Counts;
  altars: Partial<Record<AltarSide, Altar>>;
  announcement: Announcement;
}

/** Начался новый акт: пополнение мастерской, новые лоты и вещи, снятое скрытие, объявление. */
export interface ActStarted extends EventBase {
  type: 'ActStarted';
  act: 2 | 3;
  refill: number;
  /** Сколько длилась пауза, прерванная сменой акта (0, если паузы не было). */
  pausedMs: number;
  newLots: Lot[];
  newItems: Item[];
  announcedLots: string[];
  revealedItems: string[];
  announcement: Announcement;
}
export interface ClockPaused extends EventBase { type: 'ClockPaused' }
export interface ClockResumed extends EventBase { type: 'ClockResumed'; pausedMs: number }
export interface ClockExtended extends EventBase { type: 'ClockExtended'; minutes: number }
export interface Announced extends EventBase { type: 'Announced'; title: string; text: string }
export interface Corrected extends EventBase { type: 'Corrected'; playerKey: string; change: Correction; reason: string }
export interface InviteRebound extends EventBase { type: 'InviteRebound'; roleKey: string; code: string }

/** Игрок предложил сделку; его сторона give зарезервирована. */
export interface OfferCreated extends EventBase { type: 'OfferCreated'; offer: Offer }
/** Адресат принял: обе стороны переданы разом. exchanged — передано ли хоть что-то кроме слухов. */
export interface OfferAccepted extends EventBase {
  type: 'OfferAccepted'; id: string; from: string; to: string; give: Bundle; get: Bundle; service: boolean; exchanged: boolean;
}
/** Предложение закрыто без обмена: отказ, отмена или истечение (reason: timeout, author, counterparty). */
export interface OfferClosed extends EventBase {
  type: 'OfferClosed'; id: string; status: Exclude<OfferStatus, 'pending' | 'accepted'>; reason?: string;
}

/** Игрок купил ингредиенты в мастерской по 2 золота за штуку. */
export interface IngredientBought extends EventBase {
  type: 'IngredientBought'; player: string; ingredient: Ingredient; count: number; paidGold: number;
}
/** Игрок изготовил вещь; вещь целиком в событии. Шипы и скидка потрачены в любом случае. */
export interface ItemCrafted extends EventBase {
  type: 'ItemCrafted'; player: string; item: Item; paidGold: number; paidIngredients: Partial<Counts>;
  clearedThorns: boolean; clearedDiscount: boolean;
}
/** Ведущий открыл торг за лот: две минуты голосом, окно только для часов. */
export interface LotBiddingOpened extends EventBase { type: 'LotBiddingOpened'; id: string; until: number; title: string }
/** Ведущий открыл окно закрытых ставок на 90 секунд. */
export interface LotSealedOpened extends EventBase { type: 'LotSealedOpened'; id: string; until: number; title: string }
/** Игрок поставил или поднял закрытую ставку; золото в резерве. */
export interface LotBid extends EventBase { type: 'LotBid'; id: string; player: string; amount: number }
/** Торг закрыт: победитель платит ставку в банк и получает вещи; без ставок лот уходит в выкуп по fixedPrice. */
export interface LotClosed extends EventBase { type: 'LotClosed'; id: string; title: string; winner?: string; amount?: number; fixedPrice?: number }
/** Лот без ставок выкуплен первым, у кого нашлось золото. */
export interface LotBought extends EventBase { type: 'LotBought'; id: string; title: string; player: string; price: number }
/** Вклад на алтарь: осколок, Фокус или золото. */
export interface Contributed extends EventBase { type: 'Contributed'; side: AltarSide; contribution: Contribution }
/** Игрок забрал свой вклад с алтаря обратно. */
export interface ContributionWithdrawn extends EventBase {
  type: 'ContributionWithdrawn'; side: AltarSide; contributionId: string; player: string; item?: string; gold?: number;
}

// События следующих задач добавляются в объединение по мере реализации.
export type Event = SessionCreated | SessionReset | RosterSet | RoleToggled | PlayerBound | PresenceSet | FairOpened
  | ActStarted | ClockPaused | ClockResumed | ClockExtended | Announced | Corrected | InviteRebound
  | OfferCreated | OfferAccepted | OfferClosed | IngredientBought | ItemCrafted | Contributed | ContributionWithdrawn
  | LotBiddingOpened | LotSealedOpened | LotBid | LotClosed | LotBought;
export type EventType = Event['type'];
