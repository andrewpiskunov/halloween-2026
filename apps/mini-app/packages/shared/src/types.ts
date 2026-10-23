export type Side = 'wake' | 'bind' | 'break' | 'ship' | 'free';
export type AltarSide = Exclude<Side, 'free'>;
export type Ingredient = 'ash' | 'moon' | 'dew';
export type Phase = 'setup' | 'act1' | 'act2' | 'act3' | 'closed' | 'revealed';
export type ItemKind = 'relic' | 'shard' | 'clue' | 'potion' | 'ward' | 'focus' | 'shape';
export type Owner = { type: 'player'; key: string } | { type: 'altar'; side: AltarSide } | { type: 'lot'; id: string };
export interface Item { id: string; kind: ItemKind; ref: string; owner: Owner; createdBy?: string; hiddenUntilAct?: 3; reservedFor?: string }
export type Counts = Record<Ingredient, number>;
export interface Bundle { gold: number; ingredients: Counts; items: string[]; rumor?: string }
export interface Player {
  roleKey: string; telegramId?: number; present: boolean;
  gold: number; reservedGold: number; ingredients: Counts;
  abilityUsedInAct: boolean; pendingModifier?: unknown; protection?: { by: string };
  thorns: boolean; curse: boolean; discount: boolean; side?: Side; hostileAttemptsAgainstInAct: number;
}
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface Offer { id: string; from: string; to: string; give: Bundle; get: Bundle; service: boolean; status: OfferStatus; createdAt: number; expiresAt: number; reason?: string }
export type LotStatus = 'queued' | 'announced' | 'openBidding' | 'sealedBidding' | 'fixedPrice' | 'sold' | 'unsold';
export interface Lot { id: string; items: string[]; act: 1 | 2 | 3; status: LotStatus; bids: { player: string; amount: number; at: number }[]; fixedPrice?: number }
export interface Contribution { id: string; player: string; item?: string; gold?: number }
export interface Altar { side: AltarSide; contributions: Contribution[] }
export interface Announcement { at: number; title: string; text: string }
export interface GameState {
  phase: Phase; roster: string[]; nPresent: number;
  clock: { actStartedAt: number; pausedAt?: number; pausedTotal: number };
  players: Record<string, Player>; items: Record<string, Item>;
  workshop: Counts; offers: Record<string, Offer>; lots: Record<string, Lot>;
  altars: Partial<Record<AltarSide, Altar>>; invites: Record<string, string>;   // roleKey → код
  gmTelegramId?: number; announcements: Announcement[]; seq: number;
}
