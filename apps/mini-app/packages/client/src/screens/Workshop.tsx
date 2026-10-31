import { useEffect, useRef, useState } from 'preact/hooks';
import type { Counts, Ingredient, PlayerView, Recipe } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { FrozenNote } from '../components/Frozen';
import { ItemCard } from '../components/ItemCard';
import { ResCost } from '../components/ResCost';
import { INGREDIENTS, SHOP_PRICE, countsText, goldText, ingredientName } from '../labels';
import { abilityDraft, ask, run } from '../store';
import { AbilityForm, INLINE_WORKSHOP, sendAbility, sendCopy } from './AbilityForm';

/** Модификатор изготовления способностью: копия CraftModifier из engine/shop.ts. */
export interface CraftMod { ashByGold?: true; freeWork?: true; substitute?: { from: Ingredient; to: Ingredient } }

/** Цена рецепта с учётом способности, шипов и скидки — так же считает сервер (craftQuote). */
export function craftPrice(r: Recipe, v: PlayerView, mod: CraftMod = {}): number {
  const p = v.me.player;
  const base = r.gold + (mod.ashByGold ? 1 : 0) - (mod.freeWork ? 1 : 0);
  return v.hidden17 ? Math.max(0, base - (p.discount ? 1 : 0)) + (p.thorns ? 1 : 0) : Math.max(0, base + (p.thorns ? 1 : 0) - (p.discount ? 1 : 0));
}

/** Ингредиенты рецепта со способностью: Пепел за золото или замена одного ингредиента. */
export function craftCost(r: Recipe, mod: CraftMod = {}): Partial<Counts> {
  const cost: Partial<Counts> = { ...r.cost };
  if (mod.ashByGold && cost.ash) cost.ash -= 1;
  if (mod.substitute && cost[mod.substitute.from]) {
    cost[mod.substitute.from]! -= 1;
    cost[mod.substitute.to] = (cost[mod.substitute.to] ?? 0) + 1;
  }
  for (const i of INGREDIENTS) if (!cost[i.key]) delete cost[i.key];
  return cost;
}

/** Цена покупки способностями: копии CHEAP_PRICE и BANK_PRICE из engine/abilities.ts. */
const CHEAP_PRICE = 1;
const BANK_PRICE = 2;

/** Мастерская: запас ингредиентов на покупку и рецепты, всё на тёмных карточках с цветными иконками. */
export function Workshop({ v }: { v: PlayerView }) {
  const a = v.me.available;
  const ab = v.me.ability;
  const live = ab.state === 'available';
  const kind = ab.kind;
  const canSubstitute = live && (kind === 'substituteIngredient' || (kind === 'copyAbility' && !!ab.copy?.some(c => c.kind === 'substituteIngredient')));
  const block = useRef<HTMLDivElement>(null);

  // «В мастерскую» с карточки способности: показать блок способности.
  useEffect(() => {
    if (!abilityDraft.value) return;
    block.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    abilityDraft.value = null;
  }, [abilityDraft.value]);

  const buy = (ing: (typeof INGREDIENTS)[number]) => ask({
    title: `Купить «${ing.name}» за ${goldText(SHOP_PRICE)}?`,
    okLabel: 'Купить',
    onOk: () => void run({ type: 'shop.buy', ingredient: ing.key, count: 1 }),
  });
  const craft = (r: Recipe) => ask({
    title: `${v.hidden17 ? 'Заказать у мастера' : 'Создать'} «${r.name}»?`,
    text: `Спишется: ${countsText({ gold: craftPrice(r, v), ingredients: r.cost })}.`,
    okLabel: v.hidden17 ? 'Заказать' : 'Создать',
    onOk: () => void run({ type: 'shop.craft', recipeId: r.id }),
  });
  const buyCheap = (ing: Ingredient) => sendAbility({ kind: 'buyCheap', ingredient: ing },
    { title: `Купить «${ingredientName(ing)}» за ${goldText(CHEAP_PRICE)}?`, text: `Способность «${ab.name}», раз в акт.` });
  const buyBank = (ing: Ingredient) => sendAbility({ kind: 'buyFromBank', ingredient: ing },
    { title: `Купить «${ingredientName(ing)}» из банка за ${goldText(BANK_PRICE)}?`, text: 'Запас мастерской не уменьшится.' });

  const standalone = live && !INLINE_WORKSHOP.includes(kind) && ab.place === 'workshop';

  return (
    <>
      {ab.place === 'workshop' && (
        <div class="m-card" ref={block}>
          <h5>Способность</h5>
          <h4>{ab.name}</h4>
          <p class="text">{ab.text}</p>
          {!live && <p class="ab-state">{ab.state === 'used' ? 'Уже применена в этом акте' : 'Сейчас недоступна'}</p>}
          {live && INLINE_WORKSHOP.includes(kind) && <p class="m-note">Кнопка способности — рядом с {kind === 'buyCheap' || kind === 'buyFromBank' ? '«Купить» в запасе' : 'рецептом'}.</p>}
          {standalone && <div class="ab-form"><AbilityForm v={v} /></div>}
        </div>
      )}

      <h2 class="scr-h">Мастерская <small>по {goldText(SHOP_PRICE)} за штуку</small></h2>
      <FrozenNote v={v} />
      <div class="item-block">
        <h5>Запас мастерской</h5>
        {INGREDIENTS.map(ing => (
          <ItemCard key={ing.key} emoji={ing.emoji} img={resourceImageUrl(ing.key)} title={ing.name}
            sub={`осталось ${v.workshop[ing.key]}, у вас ${a.ingredients[ing.key]}`}>
            <Button small kind="sec" disabled={v.workshop[ing.key] < 1} onClick={() => buy(ing)}>Купить</Button>
            {live && kind === 'buyCheap' && (
              <Button small disabled={v.workshop[ing.key] < 1 || a.gold < CHEAP_PRICE} onClick={() => buyCheap(ing.key)}>За 1 · {ab.name}</Button>
            )}
            {live && kind === 'buyFromBank' && (
              <Button small disabled={a.gold < BANK_PRICE} onClick={() => buyBank(ing.key)}>Из банка за 2</Button>
            )}
          </ItemCard>
        ))}
        <p class="m-note">У вас {goldText(a.gold)} доступно.</p>
      </div>

      <h2 class="scr-h">Рецепты</h2>
      {v.recipes.map(r => {
        const price = craftPrice(r, v);
        const lacking = lackingParts(r.cost, price, v);
        return (
          <div key={r.id} class="item-block">
            <ItemCard emoji={r.emoji} img={itemImageUrl({ kind: 'potion', ref: r.id })} title={r.name} sub={<ResCost parts={costParts(r.cost, price)} />}>
              <Button small kind={lacking.length ? 'sec' : 'main'} disabled={lacking.length > 0} onClick={() => craft(r)}>
                {v.hidden17 ? 'Заказать' : 'Создать'}
              </Button>
            </ItemCard>
            <p class="m-note">{r.text}</p>
            {lacking.length > 0 && <p class="m-note m-no">Не хватает: <ResCost parts={lacking} sep=", " /></p>}
            {live && kind === 'payAshWithGold' && r.cost.ash ? (
              <AbilityCraft v={v} r={r} mod={{ ashByGold: true }} note="1 Пепел заменён: −1 Пепел, +1 золото"
                onCraft={() => sendAbility({ kind: 'payAshWithGold', recipeId: r.id }, craftConf(r, v, { ashByGold: true }))} />
            ) : null}
            {live && kind === 'focusFree' && r.id === 'focus' && (
              <AbilityCraft v={v} r={r} mod={{ freeWork: true }} note="Без платы за работу: −1 золото"
                onCraft={() => sendAbility({ kind: 'focusFree' }, craftConf(r, v, { freeWork: true }))} />
            )}
            {canSubstitute && <SubstituteCraft v={v} r={r} />}
          </div>
        );
      })}
    </>
  );
}

/** Подтверждение изготовления со способностью: что спишется. */
function craftConf(r: Recipe, v: PlayerView, mod: CraftMod) {
  return {
    title: `Создать «${r.name}» со способностью?`,
    text: `Спишется: ${countsText({ gold: craftPrice(r, v, mod), ingredients: craftCost(r, mod) })}.`,
  };
}

/** Строка цены со способностью и кнопка «Создать со способностью». */
function AbilityCraft({ v, r, mod, note, onCraft }: { v: PlayerView; r: Recipe; mod: CraftMod; note: string; onCraft: () => void }) {
  const price = craftPrice(r, v, mod);
  const cost = craftCost(r, mod);
  const lacking = lackingParts(cost, price, v);
  return (
    <div class="ab-craft">
      <span class="m-note">{note}. Итого: <ResCost parts={costParts(cost, price)} /></span>
      <Button small disabled={lacking.length > 0} onClick={onCraft}>Создать со способностью</Button>
    </div>
  );
}

/** Грета и Астра: выбрать, что заменить и чем, затем создать. */
function SubstituteCraft({ v, r }: { v: PlayerView; r: Recipe }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Ingredient | null>(null);
  const [to, setTo] = useState<Ingredient | null>(null);
  const copy = v.me.ability.kind === 'copyAbility';
  if (!open) {
    return <div class="ab-craft"><span class="m-note">Замена ингредиента</span><Button small kind="sec" onClick={() => setOpen(true)}>Создать со способностью</Button></div>;
  }
  const mod: CraftMod | undefined = from && to ? { substitute: { from, to } } : undefined;
  const craft = () => {
    if (!from || !to || !mod) return;
    const use = { kind: 'substituteIngredient' as const, recipeId: r.id, from, to };
    const c = craftConf(r, v, mod);
    if (copy) sendCopy(v, use, c, () => setOpen(false));
    else sendAbility(use, c, () => setOpen(false));
  };
  return (
    <div class="choice">
      <span class="m-note">Что заменить?</span>
      <div class="m-btns">
        {INGREDIENTS.filter(i => r.cost[i.key]).map(i => (
          <Button key={i.key} small kind={from === i.key ? 'main' : 'sec'} onClick={() => { setFrom(i.key); if (to === i.key) setTo(null); }}>{i.emoji} {i.short}</Button>
        ))}
      </div>
      <span class="m-note">Чем?</span>
      <div class="m-btns">
        {INGREDIENTS.filter(i => i.key !== from).map(i => (
          <Button key={i.key} small kind={to === i.key ? 'main' : 'sec'} onClick={() => setTo(i.key)}>{i.emoji} {i.short}</Button>
        ))}
      </div>
      {mod
        ? <AbilityCraft v={v} r={r} mod={mod} note={`Замена: ${ingredientName(from!)} → ${ingredientName(to!)}`} onCraft={craft} />
        : <Button small kind="sec" onClick={() => setOpen(false)}>Свернуть</Button>}
    </div>
  );
}

type CostParts = Parameters<typeof ResCost>[0]['parts'];

/** Стоимость: ингредиенты по порядку, затем золото. */
function costParts(cost: Partial<Counts>, price: number): CostParts {
  return [...INGREDIENTS.filter(i => cost[i.key]).map((i): CostParts[number] => [i.key, cost[i.key]!]), ['gold', price]];
}

/** Чего не хватает до изготовления: ингредиенты и золото сверх доступного. */
function lackingParts(cost: Partial<Counts>, price: number, v: PlayerView): CostParts {
  const a = v.me.available;
  return [
    ...INGREDIENTS.filter(i => (cost[i.key] ?? 0) > a.ingredients[i.key])
      .map((i): CostParts[number] => [i.key, (cost[i.key] ?? 0) - a.ingredients[i.key]]),
    ...(price > a.gold ? [['gold', price - a.gold] as CostParts[number]] : []),
  ];
}
