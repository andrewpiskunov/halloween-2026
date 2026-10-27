import type { AbilityUsed, ItemUsed } from '../events';
import type { ActionRecord, Effect, GameState, Player } from '../types';

/** Игрок с изменением; необязательные поля со значением undefined удаляются, а не хранятся. */
function patchPlayer(state: GameState, key: string, patch: Partial<Player>): GameState {
  const p: Player = { ...state.players[key], ...patch };
  for (const k of Object.keys(patch) as (keyof Player)[]) if (patch[k] === undefined) delete p[k];
  return { ...state, players: { ...state.players, [key]: p } };
}

function applyEffect(state: GameState, e: Effect): GameState {
  const p = (key: string) => state.players[key];
  switch (e.type) {
    case 'gold': return patchPlayer(state, e.player, { gold: p(e.player).gold + e.delta });
    case 'goldMove': {
      const s = patchPlayer(state, e.from, { gold: p(e.from).gold - e.amount });
      return patchPlayer(s, e.to, { gold: s.players[e.to].gold + e.amount });
    }
    case 'ingredient': {
      const ing = p(e.player).ingredients;
      return patchPlayer(state, e.player, { ingredients: { ...ing, [e.ingredient]: ing[e.ingredient] + e.delta } });
    }
    case 'ingredientMove': {
      const from = p(e.from).ingredients;
      const s = patchPlayer(state, e.from, { ingredients: { ...from, [e.ingredient]: from[e.ingredient] - 1 } });
      const to = s.players[e.to].ingredients;
      return patchPlayer(s, e.to, { ingredients: { ...to, [e.ingredient]: to[e.ingredient] + 1 } });
    }
    case 'workshop': return { ...state, workshop: { ...state.workshop, [e.ingredient]: state.workshop[e.ingredient] + e.delta } };
    case 'itemRemoved': {
      const { [e.itemId]: _removed, ...items } = state.items;
      return { ...state, items };
    }
    case 'itemCreated': return { ...state, items: { ...state.items, [e.item.id]: e.item } };
    case 'protection': return patchPlayer(state, e.player, { protection: e.value ?? undefined });
    case 'protectionMoved': {
      const s = patchPlayer(state, e.to, { protection: p(e.from).protection });
      return patchPlayer(s, e.from, { protection: undefined });
    }
    case 'thorns': return patchPlayer(state, e.player, { thorns: e.value, thornsBy: e.value ? e.by : undefined });
    case 'curse': return patchPlayer(state, e.player, { curse: e.value });
    case 'discount': return patchPlayer(state, e.player, { discount: e.value, discountBy: e.value ? e.by : undefined });
    case 'guise': return patchPlayer(state, e.player, { guise: e.value ?? undefined });
  }
}

/** Применяет эффекты по порядку; пустой список возвращает то же состояние. */
export function applyEffects(state: GameState, effects: Effect[]): GameState {
  return effects.reduce(applyEffect, state);
}

const ACT_OF_PHASE = { act1: 1, act2: 2, act3: 3 } as const;

/** Номер акта для журнала; события применений бывают только в актах. */
export const actOf = (state: GameState): 1 | 2 | 3 => ACT_OF_PHASE[state.phase as keyof typeof ACT_OF_PHASE];

/** Только заданные поля: запись журнала не хранит ключей со значением undefined. */
const optional = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Добавляет запись журнала применений; id — seq события по тому же правилу, что в reduce. */
export function recordAction(state: GameState, e: AbilityUsed | ItemUsed, act: 1 | 2 | 3): GameState {
  const common = { id: String(e.seq ?? state.seq + 1), at: e.at, act };
  const record: ActionRecord = e.type === 'AbilityUsed'
    ? {
      ...common, author: e.author,
      source: { type: 'ability', ability: e.ability, ...optional({ copied: e.copied }) },
      outcome: e.outcome, hostile: e.hostile, effects: e.effects,
      ...optional({ target: e.target, from: e.from, to: e.to, removed: e.removed, intel: e.intel, requestId: e.requestId, item: e.item }),
    }
    : {
      ...common, author: e.player, source: { type: 'item', kind: e.kind }, target: e.target,
      outcome: 'done', hostile: false, effects: e.effects,
      ...optional({ removed: e.removed, guise: e.guise, requestId: e.requestId }),
    };
  return { ...state, actions: [...state.actions, record] };
}
