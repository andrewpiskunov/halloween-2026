// Применения способностей для ботов (спецификация этапа 6, §2.4): параметры строятся только по проекции игрока.
import type { AbilityKind, AbilityUse, Ingredient, PlayerView, Recipe } from '@fair/shared';
import { CRAFTED, INGREDIENTS, REFORGEABLE, REFORGE_INTO, freeItems } from './items';
import type { Rng } from './rng';

/** Враждебные виды: в акте I боты их пропускают. */
export const HOSTILE: ReadonlySet<AbilityKind> = new Set<AbilityKind>(['stealGold', 'stealIngredient', 'thorns']);

/**
 * Допустимые отказы invalid на применение своей способности (§2.4): подстроки detail из движка
 * для условий, которые зависят от скрытого состояния цели. «условия изменились» — причина
 * failed у просьб согласия, когда после одобрения проверка не прошла.
 */
export const ALLOWED_INVALID: Record<AbilityKind, string[]> = {
  payAshWithGold: [], focusFree: [], substituteIngredient: [],
  buyCheap: [], buyBulk: [], buyFromBank: [],
  grow: [], swapIngredient: [],
  disassemble: [], reforge: [], sellToBank: [],
  protectSelf: [], protectOther: [],
  transferProtection: ['у защищённого нет защиты', 'условия изменились'],
  cleanseOther: ['условия изменились'],
  discountOther: ['у цели уже есть скидка', 'условия изменились'],
  copyAbility: ['условия изменились'],
  stealGold: [], stealIngredient: [],
  thorns: ['у цели уже есть шипы'],
  inspectInventory: [], sniffIngredient: [], knowGold: [], askSide: [], askYesNo: [],
};

/** Другие присутствующие по ключу роли; выбор через rng не зависит от порядка в проекции. */
function pickOther(view: PlayerView, rng: Rng): string | null {
  const keys = view.others.map(o => o.roleKey).filter(k => k !== view.me.role.key).sort();
  return keys.length > 0 ? rng.pick(keys) : null;
}

/** Предпочтительно из подходящих, иначе из всех: отказ insufficient для бота допустим. */
function prefer<T>(rng: Rng, good: T[], all: T[]): T {
  return rng.pick(good.length > 0 ? good : all);
}

const has = (view: PlayerView) => INGREDIENTS.filter(k => view.me.available.ingredients[k] >= 1);
const inStock = (view: PlayerView) => INGREDIENTS.filter(k => view.workshop[k] >= 1);

/** Пара ингредиентов из запаса мастерской (одинаковые, только если их там два). */
function stockPair(view: PlayerView, rng: Rng): [Ingredient, Ingredient] {
  const pairs: [Ingredient, Ingredient][] = [];
  for (const a of INGREDIENTS) for (const b of INGREDIENTS) {
    if (a > b) continue;
    const ok = a === b ? view.workshop[a] >= 2 : view.workshop[a] >= 1 && view.workshop[b] >= 1;
    if (ok) pairs.push([a, b]);
  }
  return prefer(rng, pairs, [['ash', 'moon']]);
}

/** Хватает ли ингредиентов на стоимость после поправки. */
function affordable(view: PlayerView, cost: Partial<Record<Ingredient, number>>): boolean {
  return INGREDIENTS.every(k => (cost[k] ?? 0) <= view.me.available.ingredients[k]);
}

/** Рецепт для Серафины: с Пеплом в стоимости; один Пепел платится золотом. */
function payAsh(view: PlayerView, rng: Rng): AbilityUse | null {
  const withAsh = view.recipes.filter(r => (r.cost.ash ?? 0) > 0);
  if (withAsh.length === 0) return null;
  const good = withAsh.filter(r => affordable(view, { ...r.cost, ash: (r.cost.ash ?? 0) - 1 }) && view.me.available.gold >= r.gold + 1);
  return { kind: 'payAshWithGold', recipeId: prefer(rng, good, withAsh).id };
}

/** Замена одного ингредиента рецепта другим (Грета, копия Астры не используется). */
function substitute(view: PlayerView, rng: Rng): AbilityUse | null {
  const options: { recipe: Recipe; from: Ingredient; to: Ingredient }[] = [];
  for (const recipe of view.recipes) for (const from of INGREDIENTS) for (const to of INGREDIENTS) {
    if (from !== to && (recipe.cost[from] ?? 0) > 0) options.push({ recipe, from, to });
  }
  if (options.length === 0) return null;
  const good = options.filter(o => {
    const cost = { ...o.recipe.cost, [o.from]: (o.recipe.cost[o.from] ?? 0) - 1, [o.to]: (o.recipe.cost[o.to] ?? 0) + 1 };
    return affordable(view, cost) && view.me.available.gold >= o.recipe.gold;
  });
  const o = prefer(rng, good, options);
  return { kind: 'substituteIngredient', recipeId: o.recipe.id, from: o.from, to: o.to };
}

/** Применение своего вида по проекции или null, если предпосылок нет (нет вещи, нет защиты, нет цели). */
export function useFor(kind: AbilityKind, view: PlayerView, rng: Rng): AbilityUse | null {
  const self = view.me.role.key;
  const target = (make: (t: string) => AbilityUse): AbilityUse | null => {
    const t = pickOther(view, rng);
    return t === null ? null : make(t);
  };

  switch (kind) {
    case 'payAshWithGold': return payAsh(view, rng);
    case 'focusFree': return { kind };
    case 'substituteIngredient': return substitute(view, rng);
    case 'buyCheap': return { kind, ingredient: prefer(rng, inStock(view), INGREDIENTS) };
    case 'buyBulk': return { kind, take: stockPair(view, rng) };
    case 'buyFromBank': return { kind, ingredient: rng.pick(INGREDIENTS) };
    case 'grow': return { kind, give: prefer(rng, has(view).filter(i => i !== 'dew'), ['ash', 'moon']) };
    case 'swapIngredient': {
      const give = prefer(rng, has(view), INGREDIENTS);
      const others = INGREDIENTS.filter(k => k !== give);
      return { kind, give, take: prefer(rng, others.filter(k => view.workshop[k] >= 1), others) };
    }

    case 'disassemble': {
      const items = freeItems(view, CRAFTED);
      return items.length === 0 ? null : { kind, itemId: rng.pick(items).id, take: stockPair(view, rng) };
    }
    case 'reforge': {
      const items = freeItems(view, REFORGEABLE);
      if (items.length === 0) return null;
      const it = rng.pick(items);
      const into = (Object.keys(REFORGE_INTO) as (keyof typeof REFORGE_INTO)[]).filter(r => REFORGE_INTO[r] !== it.kind);
      return { kind, itemId: it.id, into: rng.pick(into) };
    }
    case 'sellToBank': {
      const items = freeItems(view, CRAFTED);
      return items.length === 0 ? null : { kind, itemId: rng.pick(items).id };
    }

    case 'protectSelf': return { kind };
    case 'protectOther': return target(t => ({ kind, target: t }));
    // Чужая защита в проекции не видна: переносим только свою.
    case 'transferProtection':
      if (view.me.player.protection === undefined) return null;
      return target(t => ({ kind, from: self, to: t }));
    case 'cleanseOther': return target(t => ({ kind, target: t }));
    case 'discountOther': return target(t => ({ kind, target: t }));
    case 'copyAbility': {
      const own = has(view).filter(i => i !== 'dew');
      return own.length === 0 ? null : { kind, copy: { kind: 'grow', give: rng.pick(own) } };
    }

    case 'stealGold': return target(t => ({ kind, target: t }));
    case 'stealIngredient': return target(t => ({ kind, target: t, ingredient: rng.pick(INGREDIENTS) }));
    case 'thorns': return target(t => ({ kind, target: t }));

    case 'inspectInventory': return target(t => ({ kind, target: t }));
    case 'sniffIngredient': return { kind, ingredient: rng.pick(INGREDIENTS) };
    case 'knowGold': return target(t => ({ kind, target: t }));
    case 'askSide': return target(t => ({ kind, target: t }));
    case 'askYesNo': return target(t => ({ kind, target: t, question: 'Вы видели сегодня осколок?' }));
  }
}

/**
 * Другие попытки в том же ходу после отказа «у цели нечего взять»: тот же человек, другие ингредиенты
 * по порядку. Отказ движка ничего не тратит (ни применения, ни попытки по цели), а запасы цели в проекции
 * не видны: иначе успех кражи ингредиента зависел бы от угадывания и покрытие плавало бы от прогона к прогону.
 */
export function retriesFor(use: AbilityUse): AbilityUse[] {
  if (use.kind !== 'stealIngredient') return [];
  return INGREDIENTS.filter(k => k !== use.ingredient).map(ingredient => ({ ...use, ingredient }));
}
