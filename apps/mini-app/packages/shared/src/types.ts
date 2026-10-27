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
  abilityUsedInAct: boolean; pendingModifier?: unknown; protection?: { by: string };
  thorns: boolean; curse: boolean; discount: boolean; side?: Side; hostileAttemptsAgainstInAct: number;
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
export interface GameState {
  phase: Phase; roster: string[]; nPresent: number;
  clock: { actStartedAt: number; pausedAt?: number; pausedTotal: number };
  players: Record<string, Player>; items: Record<string, Item>;
  workshop: Counts; offers: Record<string, Offer>; lots: Record<string, Lot>;
  altars: Partial<Record<AltarSide, Altar>>; invites: Record<string, string>;   // roleKey → код
  /** roleKey → telegramId; переживает уход роли из состава и её возвращение. */
  bindings: Record<string, number>;
  gmCode: string; gmTelegramId?: number; announcements: Announcement[]; seq: number;
}
