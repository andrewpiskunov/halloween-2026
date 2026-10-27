import type { AbilityUse } from '../commands';
import type { AbilityUsed } from '../events';
import type { Effect, GameState } from '../types';
import { otherTarget, presentPlayer } from './guards';
import { fail, type Result } from './result';

/** Виды, которые на другом игроке требуют согласия (§4.1); копия Астры живёт в abilities.ts. */
export type ConsentedUse = Extract<AbilityUse, { kind: 'cleanseOther' | 'discountOther' | 'transferProtection' }>;

const KINDS: ConsentedUse['kind'][] = ['cleanseOther', 'discountOther', 'transferProtection'];
export const isConsentedKind = (u: AbilityUse): u is ConsentedUse => (KINDS as string[]).includes(u.kind);

/** Поля AbilityUsed сверх общих: эффекты, цель, откуда-куда, что снято. */
export type KindFields = Pick<AbilityUsed, 'effects' | 'target' | 'from' | 'to' | 'removed'>;

/** Очищение (толкования 10–11): снимает и проклятие, и шипы; эффекты только для отметок, которые были. */
export function cleanseEffects(state: GameState, target: string): Pick<KindFields, 'effects' | 'removed'> {
  const t = state.players[target];
  const removed = { curse: t.curse, thorns: t.thorns };
  const effects: Effect[] = [];
  if (removed.curse) effects.push({ type: 'curse', player: target, value: false });
  if (removed.thorns) effects.push({ type: 'thorns', player: target, value: false });
  return { effects, removed };
}

function cleanseOther(state: GameState, author: string, target: string): KindFields | Result {
  return otherTarget(state, author, target) ?? { target, ...cleanseEffects(state, target) };
}

/** Скидка (толкование 13): на себя или на другого, у цели не должно быть скидки. */
function discountOther(state: GameState, author: string, target: string): KindFields | Result {
  if (!presentPlayer(state, target)) return fail('not_found', target);
  if (state.players[target].discount) return fail('invalid', 'у цели уже есть скидка');
  return { target, effects: [{ type: 'discount', player: target, value: true, by: author }] };
}

/** Перенос защиты (толкование 14): защита переезжает с прежним by, получатель без защиты. */
function transferProtection(state: GameState, from: string, to: string): KindFields | Result {
  if (!presentPlayer(state, from)) return fail('not_found', from);
  if (!presentPlayer(state, to)) return fail('not_found', to);
  if (to === from) return fail('invalid', 'получатель должен быть другим игроком');
  if (state.players[from].protection === undefined) return fail('invalid', 'у защищённого нет защиты');
  if (state.players[to].protection !== undefined) return fail('limit', 'у получателя уже есть защита');
  return { from, to, effects: [{ type: 'protectionMoved', from, to }] };
}

/** Проверки вида (§6.2) и поля события; согласие решается до вызова. */
export function consentedKind(state: GameState, author: string, use: ConsentedUse): KindFields | Result {
  switch (use.kind) {
    case 'cleanseOther': return cleanseOther(state, author, use.target);
    case 'discountOther': return discountOther(state, author, use.target);
    case 'transferProtection': return transferProtection(state, use.from, use.to);
  }
}

/** Кто одобряет вид на другом игроке (§4.1); пусто, если согласие не нужно. */
export function kindApprovers(author: string, use: ConsentedUse): string[] {
  switch (use.kind) {
    case 'cleanseOther': return [use.target];
    case 'discountOther': return use.target === author ? [] : [use.target];
    // Согласие получателя не спрашивается (вопрос 1).
    case 'transferProtection': return use.from === author ? [] : [use.from];
  }
}
