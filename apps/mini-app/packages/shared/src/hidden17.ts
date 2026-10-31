import type { Bundle, Counts, GameState } from './types';

export type HiddenMethod = 'salt' | 'sign' | 'vessel';
export type HiddenOrder = 'leave' | 'stay' | 'restore';
export type HiddenStep = 'preparation' | 'assembly' | 'powder' | 'choices' | 'responses' | 'last-choice' | 'finished';
export interface HiddenRole { publicFace: string; desire: string; secret: string; knowledge: string[]; firstSteps: string[]; goals: string[]; finale: { prepare: string; action: string; choice: string; impact: string }; acts: string[]; backstory: string; craftingKnown?: string[] }
export interface HiddenContent {
  title: string; publicIntro: string; publicRules: string[]; roles: Record<string, HiddenRole>;
  methods: { id: string; title: string; holders: string[]; cost: string; tell: string; counter: string; result: string; private: string }[];
  crafting: { rules: string[]; makers: Record<string, string[]> };
  signatureGoods: { id: string; name: string; maker: string; cost: Partial<Counts>; gold: number; effect: string; use: string; limits: string; gmNote?: string }[];
  ritual: { title: string; place: string; formula: string; stone: string[]; steps: { id: string; title: string; gm: string; gmAction: string; players: string[]; items: string[][]; roles: string[]; roleNote: string }[] };
  timing: { announcement: string }[];
}
export interface HiddenBoard { createdAt: number; createdActionCount: number; serviceAbility?: boolean; id: string; author: string; title: string; condition: string; verification: string; reward: Bundle; rewardItems: Record<string, { kind: import('./types').ItemKind; ref: string }>; service?: string; expiresAt: number; worker?: string; status: 'open' | 'accepted' | 'completed' | 'cancelled' | 'expired'; cancelApproved: string[] }
export interface HiddenDice { id: string; from: string; to: string; stake: 0 | 1; status: 'pending' | 'accepted' | 'started' | 'completed' | 'cancelled'; rolls?: [number, number] }
export interface HiddenProduction { id: string; maker: string; customer: string; recipeId: string; fee: number; bankGold: number; materials: Partial<Counts>; status: 'pending' | 'completed' | 'cancelled'; ability?: 'focusFree' | 'substituteIngredient'; substitute?: { from: keyof Counts; to: keyof Counts } }
export interface HiddenUse { id: string; author: string; itemId: string; ref: string; guise?: string; targets: string[]; approved: string[]; relicId?: string; question?: 'material' | 'compartment'; effects?: Record<string, 'curse' | 'thorns'>; status: 'pending' | 'completed' | 'cancelled'; answer?: string }
export interface HiddenChoice { player: string; kind: 'salt' | 'sign' | 'vessel' | 'withdraw' | 'pass'; itemId?: string; targetId?: string; shardIds?: string[]; status: 'hidden' | 'active' | 'invalid' | 'cancelled' | 'blocked'; controller?: string; order?: HiddenOrder }
export interface HiddenOutcome { life: 'awake' | 'sleep' | 'destroyed'; freedom: 'free' | 'controlled'; controller?: string; order?: HiddenOrder; power: 'whole' | 'full' | 'weak' | 'empty'; vessels: Record<string, 'full' | 'weak' | 'empty'>; goals: Record<string, [boolean, boolean]> }
export interface HiddenState {
  presentations: Record<string, string[]>; rumors: { author: string; text: string; at: number; unverified: true }[];
  version: 1; learned: Record<string, HiddenMethod[]>; prepared: Record<string, { method: HiddenMethod; controller?: string; order?: HiddenOrder }>;
  board: Record<string, HiddenBoard>; dice: Record<string, HiddenDice>; production: Record<string, HiddenProduction>; uses: Record<string, HiddenUse>;
  signatureActs: Record<string, string>; fixedGuise: Record<string, string>;
  ritual: { step: HiddenStep; circle: string[]; focuses: string[]; permissions: Record<string, string[]>; formulaSpoken: boolean; choices: Record<string, HiddenChoice>; wards: Record<string, string>; wardItems: Record<string, string>; orderSelected?: HiddenOrder; orderController?: string; extinguished: string[]; observed: string[]; outcome?: HiddenOutcome };
  facts: { truth: boolean; serafinaOffer: boolean; veldaRenounced: boolean };
}
export type HiddenCommand =
 | { type: 'hidden17.enable' }
 | { type: 'hidden17.present'; itemId: string; player: string; allow: boolean }
 | { type: 'hidden17.rumor'; text: string }
 | { type: 'hidden17.produce'; recipeId: string; customer?: string; fee?: number; ability?: 'focusFree' | 'substituteIngredient'; substitute?: { from: keyof Counts; to: keyof Counts } }
 | { type: 'hidden17.production.respond'; id: string; accept: boolean }
 | { type: 'hidden17.signature.craft'; recipeId: string }
 | { type: 'hidden17.signature.use'; itemId: string; targets: string[]; relicId?: string; question?: 'material' | 'compartment'; effects?: Record<string, 'curse' | 'thorns'> }
 | { type: 'hidden17.signature.respond'; id: string; accept: boolean }
 | { type: 'hidden17.signature.resolve'; id: string; answer: string }
 | { type: 'hidden17.board.create'; serviceAbility?: boolean; title: string; condition: string; verification: string; reward: Bundle; service?: string; expiresAt: number }
 | { type: 'hidden17.board.accept' | 'hidden17.board.cancel' | 'hidden17.board.complete' | 'hidden17.board.expire'; id: string }
 | { type: 'hidden17.dice.invite'; to: string; stake: 0 | 1 }
 | { type: 'hidden17.dice.accept' | 'hidden17.dice.cancel' | 'hidden17.dice.start'; id: string }
 | { type: 'hidden17.dice.resolve'; id: string; rolls: [number, number] }
 | { type: 'hidden17.learn'; player: string; method: HiddenMethod }
 | { type: 'hidden17.prepare'; method: HiddenMethod; itemId: string; controller?: string; order?: HiddenOrder }
 | { type: 'hidden17.ritual.start' | 'hidden17.ritual.powder' | 'hidden17.ritual.reveal' | 'hidden17.ritual.resolve' | 'hidden17.ritual.finish' }
 | { type: 'hidden17.ritual.offer'; itemId: string; include: boolean }
 | { type: 'hidden17.ritual.permission'; itemId: string; player: string; allow: boolean }
 | { type: 'hidden17.ritual.formula'; text: string }
 | { type: 'hidden17.ritual.choice'; kind: HiddenChoice['kind']; itemId?: string; targetId?: string; shardIds?: string[] }
 | { type: 'hidden17.ritual.order'; order: HiddenOrder }
 | { type: 'hidden17.ritual.cancel' }
 | { type: 'hidden17.ritual.ward'; itemId: string; against: string }
 | { type: 'hidden17.fact'; fact: 'truth' | 'serafinaOffer' | 'veldaRenounced'; value: boolean };
export interface HiddenPlayerView {
  knownItems: Record<string, { kind: import('./types').ItemKind; ref: string; owner?: string }>;
  rumors: HiddenState['rumors'];
  briefing: HiddenRole; publicIntro: string; publicRules: string[]; craftingRules: string[];
  methods: HiddenContent['methods']; knownMethods: HiddenMethod[]; productionRecipes: string[]; signatureGoods: HiddenContent['signatureGoods'];
  board: HiddenBoard[]; dice: HiddenDice[]; production: HiddenProduction[]; uses: HiddenUse[];
  prepared: HiddenState['prepared']; fixedGuise?: string;
  ritual: { accessibleShards: string[]; permissions: Record<string, string[]>; step: HiddenStep; stone: string[]; formula: string; circle: string[]; focuses: string[]; extinguished: string[]; observed: string[]; myChoice?: HiddenChoice; interventions: HiddenChoice[]; wards: Record<string, string>; orderSelected?: HiddenOrder; orderOptions: HiddenOrder[]; outcome?: HiddenOutcome };
}
/** Снимок атомарного результата; только серверный журнал, никогда не игроку. */
export interface HiddenEvent { type: 'Hidden17Enabled' | 'Hidden17Changed'; at: number; seq?: number; patch: Partial<GameState>; action: string; bankDelta?: number }

export const HIDDEN_COMMAND_TYPES = { 'hidden17.ritual.order': true, 'hidden17.present': true, 'hidden17.rumor': true, 'hidden17.enable': true, 'hidden17.produce': true, 'hidden17.production.respond': true, 'hidden17.signature.craft': true, 'hidden17.signature.use': true, 'hidden17.signature.respond': true, 'hidden17.signature.resolve': true, 'hidden17.board.create': true, 'hidden17.board.accept': true, 'hidden17.board.cancel': true, 'hidden17.board.complete': true, 'hidden17.board.expire': true, 'hidden17.dice.invite': true, 'hidden17.dice.accept': true, 'hidden17.dice.cancel': true, 'hidden17.dice.start': true, 'hidden17.dice.resolve': true, 'hidden17.learn': true, 'hidden17.prepare': true, 'hidden17.ritual.start': true, 'hidden17.ritual.powder': true, 'hidden17.ritual.reveal': true, 'hidden17.ritual.resolve': true, 'hidden17.ritual.finish': true, 'hidden17.ritual.offer': true, 'hidden17.ritual.permission': true, 'hidden17.ritual.formula': true, 'hidden17.ritual.choice': true, 'hidden17.ritual.cancel': true, 'hidden17.ritual.ward': true, 'hidden17.fact': true } as const;
