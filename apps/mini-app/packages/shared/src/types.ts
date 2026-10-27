import type { AbilityKind, CopyableKind } from './abilities';
import type { AbilityUse } from './commands';

export type Side = 'wake' | 'bind' | 'break' | 'ship' | 'free';
export type AltarSide = Exclude<Side, 'free'>;
export type Ingredient = 'ash' | 'moon' | 'dew';
export type Phase = 'setup' | 'act1' | 'act2' | 'act3' | 'closed' | 'revealed';
export type ItemKind = 'relic' | 'shard' | 'clue' | 'potion' | 'ward' | 'focus' | 'shape';
export type Owner = { type: 'player'; key: string } | { type: 'altar'; side: AltarSide } | { type: 'lot'; id: string };
export interface Item { id: string; kind: ItemKind; ref: string; owner: Owner; createdBy?: string; hiddenUntilAct?: 3; reservedFor?: string }
export type Counts = Record<Ingredient, number>;
/** Просьба о вещи по названию: вид и ref, без id. Только в get предложения; при принятии сервер находит вещь у адресата. */
export interface Want { kind: Item['kind']; ref: string }
export interface Bundle { gold: number; ingredients: Counts; items: string[]; rumor?: string; wants?: Want[] }
export interface Player {
  roleKey: string; telegramId?: number; present: boolean;
  gold: number; reservedGold: number; ingredients: Counts;
  abilityUsedInAct: boolean;
  /** id запроса согласия на способность, пока он pending. */
  abilityPending?: string;
  protection?: { by: string; source: 'ability' | 'ward' | 'gm' };
  thorns: boolean; thornsBy?: string;
  curse: boolean;
  discount: boolean; discountBy?: string;
  guise?: { name: string; at: number; by: string };
  side?: Side;
  hostileAttemptsAgainstInAct: number;
  /** Исправления ведущего по личным целям: null или отсутствие — считать по журналу. */
  goalOverrides?: [boolean | null, boolean | null];
  /** Когда выдан стартовый набор: при открытии или при первом приходе опоздавшего. */
  startIssuedAt?: number;
}
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface Offer { id: string; from: string; to: string; give: Bundle; get: Bundle; service: boolean; status: OfferStatus; createdAt: number; expiresAt: number; reason?: string }
export type LotStatus = 'queued' | 'announced' | 'openBidding' | 'sealedBidding' | 'fixedPrice' | 'sold' | 'unsold';
export interface Lot {
  id: string; items: string[]; act: 1 | 2 | 3; status: LotStatus;
  /** Закрытые ставки: по одной на игрока, новая заменяет старую; золото в резерве до закрытия торга. */
  bids: { player: string; amount: number; at: number }[];
  fixedPrice?: number;
  /** Концы окон открытого торга и закрытых ставок по часам ярмарки; на паузе сдвигаются. */
  openUntil?: number; sealedUntil?: number;
  /** Кому ушёл лот и за сколько (ставка или выкуп). */
  winner?: string; price?: number;
}
export interface Contribution { id: string; player: string; item?: string; gold?: number }
export interface Altar { side: AltarSide; contributions: Contribution[] }
export interface Announcement { at: number; title: string; text: string }
/** Изменение ресурса или отметки от способности или вещи; применяется одним редьюсером applyEffects. */
export type Effect =
  | { type: 'gold'; player: string; delta: number }                       // в банк или из банка
  | { type: 'goldMove'; from: string; to: string; amount: number }        // кража
  | { type: 'ingredient'; player: string; ingredient: Ingredient; delta: number }
  | { type: 'ingredientMove'; from: string; to: string; ingredient: Ingredient }
  | { type: 'workshop'; ingredient: Ingredient; delta: number }
  | { type: 'itemRemoved'; itemId: string }
  | { type: 'itemCreated'; item: Item }
  | { type: 'protection'; player: string; value: Player['protection'] | null }
  | { type: 'protectionMoved'; from: string; to: string }
  | { type: 'thorns'; player: string; value: boolean; by?: string }
  | { type: 'curse'; player: string; value: boolean }
  | { type: 'discount'; player: string; value: boolean; by?: string }
  | { type: 'guise'; player: string; value: Player['guise'] | null };

/** Итог наблюдательной способности: видит только автор и ведущий. */
export type Intel =
  | { kind: 'inventory'; target: string; gold: number; reservedGold: number; ingredients: Counts; items: { kind: ItemKind; ref: string }[] }
  | { kind: 'gold'; target: string; gold: number }
  | { kind: 'side'; target: string; side: Side }                 // 'free' для свободного без выбора
  | { kind: 'sniff'; ingredient: Ingredient; holders: string[] }
  | { kind: 'question'; target: string; question?: string };     // Веста: ответ голосом

/** Запись журнала применений: одна на AbilityUsed и ItemUsed. Источник для целей и личных лент. */
export interface ActionRecord {
  id: string;                  // seq события как строка
  at: number;
  act: 1 | 2 | 3;
  author: string;
  source: { type: 'ability'; ability: AbilityKind; copied?: CopyableKind } | { type: 'item'; kind: 'potion' | 'ward' | 'shape' };
  target?: string;
  from?: string; to?: string;
  outcome: 'done' | 'blocked';
  hostile: boolean;
  effects: Effect[];
  removed?: { curse: boolean; thorns: boolean };
  intel?: Intel;
  guise?: string;
  requestId?: string;
}

export type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'failed';

/** Что исполнится после согласия: ровно то, что прислал автор. */
export type ConsentAction =
  | { type: 'ability'; use: AbilityUse }
  | { type: 'item'; itemId: string; target: string; guise?: string };

export interface ConsentRequest {
  id: string;
  author: string;
  action: ConsentAction;
  /** Кто должен согласиться, по порядку показа. Не пуст. */
  approvers: string[];
  /** Кто уже согласился. */
  approved: string[];
  status: ConsentStatus;
  createdAt: number;
  expiresAt: number;
  /** timeout | act | closed | gm | текст причины failed */
  reason?: string;
  /** Когда запрос закрыт (кроме accepted): по нему «Просьбы» держат закрытые сменой акта весь следующий акт. */
  closedAt?: number;
}

/** Одна сторона принятой сделки: что отдал игрок. createdBy вещей снят до перемещения. */
export interface TradeSide { gold: number; ingredients: Counts; items: { kind: ItemKind; ref: string; createdBy?: string }[] }
/** Запись журнала сделок: give — отдал from, get — отдал to. Источник для целей «по истории». */
export interface TradeRecord { id: string; at: number; from: string; to: string; service: boolean; give: TradeSide; get: TradeSide }
/** Запись журнала изготовлений: обычное изготовление, изготовление способностью и перековка. */
export interface CraftRecord { at: number; player: string; kind: ItemKind; itemId: string }

/** Итог одного алтаря при закрытии. */
export interface AltarResult { side: AltarSide; shards: number; focuses: number; gold: number; donors: number; ready: boolean }
/** Итоги закрытия ярмарки: вычисляет обработчик команды, редьюсеры только копируют. */
export interface Closing {
  closedAt: number;
  altars: AltarResult[];
  outcome: AltarSide | 'sleep';
  warnings: string[];
  truthHolder?: string;                     // roleKey
  players: Record<string, {                 // только присутствующие участники
    goals: [boolean, boolean];
    outcome: boolean;                       // достижение «исход»
    truth: boolean;
    side: Side;                             // сторона, по которой считали исход ('free' если не выбрал)
  }>;
}

export interface GameState {
  phase: Phase; roster: string[]; nPresent: number;
  clock: { actStartedAt: number; pausedAt?: number; pausedTotal: number };
  players: Record<string, Player>; items: Record<string, Item>;
  workshop: Counts; offers: Record<string, Offer>; lots: Record<string, Lot>;
  altars: Partial<Record<AltarSide, Altar>>; invites: Record<string, string>;   // roleKey → код
  /** roleKey → telegramId; переживает уход роли из состава и её возвращение. */
  bindings: Record<string, number>;
  gmCode: string; gmTelegramId?: number; announcements: Announcement[]; seq: number;
  /** Запросы согласия на способности и вещи. */
  requests: Record<string, ConsentRequest>;
  /** Журнал применений способностей и вещей. */
  actions: ActionRecord[];
  /** Журнал принятых сделок. */
  trades: TradeRecord[];
  /** Журнал изготовлений, включая перековку. */
  crafts: CraftRecord[];
  /** Итоги закрытия: появляются в FairClosed, пересчитываются в Corrected. */
  closing?: Closing;
}
