import type { PlayerView, Recipe } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { GOLD, INGREDIENTS, SHOP_PRICE, goldText } from '../labels';
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
    title: `Купить ${ing.name} за ${GOLD.emoji} ${SHOP_PRICE}?`,
    okLabel: 'Купить',
    onOk: () => void run({ type: 'shop.buy', ingredient: ing.key, count: 1 }),
  });
  const craft = (r: Recipe) => ask({
    title: `Создать «${r.name}»?`,
    text: `Спишется: ${costText(r, craftPrice(r, v))}.`,
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
        <p class="m-note">У вас {GOLD.emoji} {a.gold} доступно.</p>
      </div>

      <h2 class="scr-h">Рецепты</h2>
      {v.recipes.map(r => {
        const price = craftPrice(r, v);
        const lacking = [
          ...INGREDIENTS.filter(i => (r.cost[i.key] ?? 0) > a.ingredients[i.key])
            .map(i => `${i.emoji} ${(r.cost[i.key] ?? 0) - a.ingredients[i.key]}`),
          ...(price > a.gold ? [`${GOLD.emoji} ${price - a.gold}`] : []),
        ];
        return (
          <div key={r.id} class="item-block">
            <ItemCard emoji={r.emoji} img={itemImageUrl({ kind: 'potion', ref: r.id })} title={r.name} sub={costText(r, price)}>
              <Button small kind={lacking.length ? 'sec' : 'main'} disabled={lacking.length > 0} onClick={() => craft(r)}>
                Создать
              </Button>
            </ItemCard>
            <p class="m-note">{r.text}</p>
            {lacking.length > 0 && <p class="m-note m-no">Не хватает: {lacking.join(', ')}</p>}
          </div>
        );
      })}
    </>
  );
}

function costText(r: Recipe, price: number): string {
  const parts = INGREDIENTS.filter(i => r.cost[i.key]).map(i => `${i.emoji} ${r.cost[i.key]}`);
  parts.push(`${GOLD.emoji} ${price}`);
  return parts.join(' + ');
}
