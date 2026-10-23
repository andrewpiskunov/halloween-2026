import { useState } from 'preact/hooks';
import type { Item, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { GOLD, INGREDIENTS, itemLabel, kindLabel, roleName } from '../labels';
import { canOffer, canPutOnAltar } from '../rules';
import { ask, run, tab, tradeDraft } from '../store';

/** Сумка: золото, ингредиенты и вещи с действиями. */
export function Bag({ v }: { v: PlayerView }) {
  const { player, items, available } = v.me;
  const [altarFor, setAltarFor] = useState<string | null>(null);

  const offer = (item: Item) => { tradeDraft.value = { itemId: item.id }; tab.value = 'trades'; };
  const toAltar = (item: Item, side: PlayerView['altars'][number]) => {
    const label = itemLabel(item, v);
    ask({
      title: `Вложить «${label.name}» в ${side.name}?`,
      text: 'Вещь окажется на алтаре. Забрать её можно, пока ярмарка не закрыта.',
      okLabel: 'Вложить',
      onOk: async () => { setAltarFor(null); await run({ type: 'altar.contribute', side: side.side, itemId: item.id }); },
    });
  };

  return (
    <>
      <div class="res">
        <div><i>{GOLD.emoji}</i><b>{available.gold}</b><span>доступно</span></div>
        {INGREDIENTS.map(ing => (
          <div key={ing.key}>
            <i>{ing.emoji}</i><b>{available.ingredients[ing.key]}</b><span>{ing.short}</span>
            {player.ingredients[ing.key] !== available.ingredients[ing.key] && (
              <em class="m-note">из {player.ingredients[ing.key]}</em>
            )}
          </div>
        ))}
      </div>
      <div class="m-card">
        <h5>🪙 Золото</h5>
        <div class="m-row"><span>Доступно</span><b>{GOLD.emoji} {available.gold}</b></div>
        <div class="m-row"><span>Обещано в сделках и ставках</span><b>{GOLD.emoji} {player.reservedGold}</b></div>
      </div>

      <div class="m-card">
        <h5>🎒 Вещи</h5>
        {items.length === 0 && <p class="m-note">Пока пусто.</p>}
        {items.map(item => {
          const label = itemLabel(item, v);
          const sub = [
            kindLabel(item.kind),
            item.createdBy ? `сделал ${roleName(item.createdBy, v)}` : '',
            item.reservedFor ? 'обещано в сделке' : '',
          ].filter(Boolean).join(' · ');
          return (
            <div key={item.id} class="item-block">
              <ItemCard emoji={label.emoji} title={label.name} sub={sub} />
              <div class="m-btns">
                <Button small kind="sec" icon="🤝" disabled={!canOffer(item, v)} onClick={() => offer(item)}>Предложить</Button>
                <Button small kind="sec" icon="🕯️" disabled={!canPutOnAltar(item, v) || v.altars.length === 0}
                  onClick={() => setAltarFor(altarFor === item.id ? null : item.id)}>На алтарь</Button>
                <Button small kind="sec" icon="✨" disabled>Использовать</Button>
              </div>
              {altarFor === item.id && (
                <div class="choice">
                  <span class="m-note">Какой алтарь?</span>
                  {v.altars.map(a => (
                    <Button key={a.side} small icon="🕯️" onClick={() => toAltar(item, a)}>{a.name}</Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(player.protection || player.curse || player.thorns || player.discount) && (
        <div class="m-card">
          <h5>✨ На вас действует</h5>
          {player.protection && <div class="m-row"><span>🛡️ Защита</span><b>от {roleName(player.protection.by, v)}</b></div>}
          {player.discount && <div class="m-row"><span>🏷️ Скидка в мастерской</span><b>−1 🪙</b></div>}
          {player.thorns && <div class="m-row"><span>🌵 Шипы: следующий рецепт дороже</span><b>+1 🪙</b></div>}
          {player.curse && <div class="m-row"><span>🕸️ Проклятие</span><b class="m-no">да</b></div>}
        </div>
      )}
    </>
  );
}
