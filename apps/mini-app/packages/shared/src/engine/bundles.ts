import type { Bundle, Counts, GameState, Ingredient, Phase } from '../types';

export const INGREDIENTS: Ingredient[] = ['ash', 'moon', 'dew'];

/** Что игрок может пустить в новую сделку: всё за вычетом резерва pending-предложений. */
export function available(state: GameState, playerKey: string): { gold: number; ingredients: Counts; items: string[] } {
  const p = state.players[playerKey];
  if (!p) return { gold: 0, ingredients: { ash: 0, moon: 0, dew: 0 }, items: [] };
  const ingredients: Counts = { ...p.ingredients };
  for (const o of Object.values(state.offers)) {
    if (o.status !== 'pending' || o.from !== playerKey) continue;
    for (const k of INGREDIENTS) ingredients[k] -= o.give.ingredients[k];
  }
  const items = Object.values(state.items)
    .filter(i => i.owner.type === 'player' && i.owner.key === playerKey && i.reservedFor === undefined)
    .map(i => i.id);
  return { gold: p.gold - p.reservedGold, ingredients, items };
}

/** Хватает ли у игрока свободного золота, ингредиентов и вещей на набор. */
export function hasBundle(state: GameState, playerKey: string, b: Bundle): boolean {
  const a = available(state, playerKey);
  if (b.gold > a.gold) return false;
  if (INGREDIENTS.some(k => b.ingredients[k] > a.ingredients[k])) return false;
  const free = new Set(a.items);
  return b.items.every(id => free.has(id));
}

/** Переносит набор от одного игрока другому; резерв вещей снимается. Проверок не делает. */
export function transfer(state: GameState, from: string, to: string, b: Bundle): GameState {
  const src = state.players[from];
  const dst = state.players[to];
  const srcIng: Counts = { ...src.ingredients };
  const dstIng: Counts = { ...dst.ingredients };
  for (const k of INGREDIENTS) {
    srcIng[k] -= b.ingredients[k];
    dstIng[k] += b.ingredients[k];
  }
  const items = { ...state.items };
  for (const id of b.items) {
    const { reservedFor: _r, ...rest } = items[id];
    items[id] = { ...rest, owner: { type: 'player', key: to } };
  }
  return {
    ...state,
    items,
    players: {
      ...state.players,
      [from]: { ...src, gold: src.gold - b.gold, ingredients: srcIng },
      [to]: { ...dst, gold: dst.gold + b.gold, ingredients: dstIng },
    },
  };
}

/** Вещь у игрока, не на алтаре и не в лоте, и не скрыта до третьего акта. */
export function isTradable(state: GameState, itemId: string, phase: Phase): boolean {
  const it = state.items[itemId];
  if (!it || it.owner.type !== 'player') return false;
  return !(it.hiddenUntilAct !== undefined && phase !== 'act3');
}
