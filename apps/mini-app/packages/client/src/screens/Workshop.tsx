import type { PlayerView, Recipe } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { ResCost } from '../components/ResCost';
import { INGREDIENTS, SHOP_PRICE, countsText, goldText } from '../labels';
import { ask, run } from '../store';

/** Цена рецепта с учётом шипов и скидки — так же считает сервер. */
function craftPrice(r: Recipe, v: PlayerView): number {
  const p = v.me.player;
  return Math.max(0, r.gold + (p.thorns ? 1 : 0) - (p.discount ? 1 : 0));
}

/** Мастерская: запас ингредиентов на покупку и рецепты, всё на тёмных карточках с цветными иконками. */
export function Workshop({ v }: { v: PlayerView }) {
  const a = v.me.available;

  const buy = (ing: (typeof INGREDIENTS)[number]) => ask({
    title: `Купить «${ing.name}» за ${goldText(SHOP_PRICE)}?`,
    okLabel: 'Купить',
    onOk: () => void run({ type: 'shop.buy', ingredient: ing.key, count: 1 }),
  });
  const craft = (r: Recipe) => ask({
    title: `Создать «${r.name}»?`,
    text: `Спишется: ${countsText({ gold: craftPrice(r, v), ingredients: r.cost })}.`,
    okLabel: 'Создать',
    onOk: () => void run({ type: 'shop.craft', recipeId: r.id }),
  });

  return (
    <>
      <h2 class="scr-h">Мастерская <small>по {goldText(SHOP_PRICE)} за штуку</small></h2>
      <div class="item-block">
        <h5>Запас мастерской</h5>
        {INGREDIENTS.map(ing => (
          <ItemCard key={ing.key} emoji={ing.emoji} img={resourceImageUrl(ing.key)} title={ing.name}
            sub={`осталось ${v.workshop[ing.key]}, у вас ${a.ingredients[ing.key]}`}>
            <Button small kind="sec" disabled={v.workshop[ing.key] < 1} onClick={() => buy(ing)}>Купить</Button>
          </ItemCard>
        ))}
        <p class="m-note">У вас {goldText(a.gold)} доступно.</p>
      </div>

      <h2 class="scr-h">Рецепты</h2>
      {v.recipes.map(r => {
        const price = craftPrice(r, v);
        const lacking: CostParts = [
          ...INGREDIENTS.filter(i => (r.cost[i.key] ?? 0) > a.ingredients[i.key])
            .map((i): CostParts[number] => [i.key, (r.cost[i.key] ?? 0) - a.ingredients[i.key]]),
          ...(price > a.gold ? [['gold', price - a.gold] as CostParts[number]] : []),
        ];
        return (
          <div key={r.id} class="item-block">
            <ItemCard emoji={r.emoji} img={itemImageUrl({ kind: 'potion', ref: r.id })} title={r.name} sub={<ResCost parts={costParts(r, price)} />}>
              <Button small kind={lacking.length ? 'sec' : 'main'} disabled={lacking.length > 0} onClick={() => craft(r)}>
                Создать
              </Button>
            </ItemCard>
            <p class="m-note">{r.text}</p>
            {lacking.length > 0 && <p class="m-note m-no">Не хватает: <ResCost parts={lacking} sep=", " /></p>}
          </div>
        );
      })}
    </>
  );
}

type CostParts = Parameters<typeof ResCost>[0]['parts'];

/** Стоимость рецепта: ингредиенты по порядку, затем золото. */
function costParts(r: Recipe, price: number): CostParts {
  return [...INGREDIENTS.filter(i => r.cost[i.key]).map((i): CostParts[number] => [i.key, r.cost[i.key]!]), ['gold', price]];
}
