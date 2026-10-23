import type { Correction } from './commands';
import type { Altar, AltarSide, Announcement, Counts, Item, Lot, Player } from './types';

/** Общие поля события: время факта и номер в журнале (проставляется при записи). */
export interface EventBase { at: number; seq?: number }

/** Сессия создана с кодами приглашений: по roleKey для всех 30 ролей и ключ 'gm'. */
export interface SessionCreated extends EventBase { type: 'SessionCreated'; codes: Record<string, string> }
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
}

/** Начался новый акт: пополнение мастерской, новые лоты и вещи, снятое скрытие, объявление. */
export interface ActStarted extends EventBase {
  type: 'ActStarted';
  act: 2 | 3;
  refill: number;
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

// События следующих задач (ActStarted, OfferCreated, …) добавляются в объединение по мере реализации.
export type Event = SessionCreated | RosterSet | RoleToggled | PlayerBound | PresenceSet | FairOpened
  | ActStarted | ClockPaused | ClockResumed | ClockExtended | Announced | Corrected | InviteRebound;
export type EventType = Event['type'];
