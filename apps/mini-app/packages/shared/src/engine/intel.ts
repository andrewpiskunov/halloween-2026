import type { AbilityUse } from '../commands';
import type { Content } from '../content';
import type { GameState, Ingredient, Intel } from '../types';

/** Виды наблюдения (§5.2): не враждебны, защитой не останавливаются. */
export type ObservationUse = Extract<AbilityUse, { kind: 'inspectInventory' | 'sniffIngredient' | 'knowGold' | 'askSide' | 'askYesNo' }>;

export const OBSERVATION_KINDS: ObservationUse['kind'][] = ['inspectInventory', 'sniffIngredient', 'knowGold', 'askSide', 'askYesNo'];

export const isObservation = (use: AbilityUse): use is ObservationUse =>
  (OBSERVATION_KINDS as string[]).includes(use.kind);

const MAX_QUESTION = 200;

/** Снимок инвентаря (§2.3 п. 16): золото, резерв, ингредиенты, свои вещи; скрытый осколок V до акта III не виден. */
function inventory(state: GameState, target: string): Intel {
  const p = state.players[target];
  const hideShard = state.phase === 'act1' || state.phase === 'act2';
  const items = Object.values(state.items)
    .filter(i => i.owner.type === 'player' && i.owner.key === target)
    .filter(i => !(hideShard && i.hiddenUntilAct !== undefined))
    .map(i => ({ kind: i.kind, ref: i.ref }));
  return { kind: 'inventory', target, gold: p.gold, reservedGold: p.reservedGold, ingredients: { ...p.ingredients }, items };
}

/** Нюх (§2.3 п. 17): присутствующие, кроме автора, у кого ингредиент есть вообще, включая обещанный. */
function sniff(state: GameState, author: string, ingredient: Ingredient): Intel {
  const holders = state.roster.filter(k => {
    const p = state.players[k];
    return k !== author && p?.present && p.ingredients[ingredient] >= 1;
  });
  return { kind: 'sniff', ingredient, holders };
}

/** Исповедь (§2.3 п. 19): сторона роли; свободный — выбранная или 'free'. */
function side(state: GameState, content: Content, target: string): Intel {
  const roleSide = content.roleByKey[target].side;
  const value = roleSide === 'free' ? state.players[target].side ?? 'free' : roleSide;
  return { kind: 'side', target, side: value };
}

/** Вопрос Весты: обрезан по краям и до 200 символов; пустой не сохраняется. */
function question(target: string, text?: string): Intel {
  const q = (text ?? '').trim().slice(0, MAX_QUESTION);
  return { kind: 'question', target, ...(q ? { question: q } : {}) };
}

/** Итог наблюдательной способности; цель и параметры уже проверены. */
export function buildIntel(state: GameState, content: Content, use: ObservationUse, author: string): Intel {
  switch (use.kind) {
    case 'inspectInventory': return inventory(state, use.target);
    case 'sniffIngredient': return sniff(state, author, use.ingredient);
    case 'knowGold': return { kind: 'gold', target: use.target, gold: state.players[use.target].gold };
    case 'askSide': return side(state, content, use.target);
    case 'askYesNo': return question(use.target, use.question);
  }
}
