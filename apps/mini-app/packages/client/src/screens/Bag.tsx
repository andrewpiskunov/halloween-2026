import { useState } from 'preact/hooks';
import type { Item, PlayerView } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { Select } from '../components/Select';
import { Thumb } from '../components/Thumb';
import { GOLD, INGREDIENTS, itemLabel, kindLabel, marksText, nameCase, plainName, plural, roleEmoji, roleName } from '../labels';
import { GUISE_MAX, canOffer, canPutOnAltar, canUseItem } from '../rules';
import { ask, run, tab, tradeDraft } from '../store';

/** Сумка: золото и ингредиенты в бумажной рамке, вещи на тёмных карточках с действиями. */
export function Bag({ v }: { v: PlayerView }) {
  const { player, items, available } = v.me;
  const [altarFor, setAltarFor] = useState<string | null>(null);
  const [useFor, setUseFor] = useState<string | null>(null);
  const marks = marksText(v);

  const toggle = (which: 'altar' | 'use', id: string) => {
    if (which === 'altar') { setUseFor(null); setAltarFor(altarFor === id ? null : id); }
    else { setAltarFor(null); setUseFor(useFor === id ? null : id); }
  };
  // Талисман применяется сразу; зелье и Камень раскрывают выбор цели.
  const use = (item: Item) => {
    if (item.kind !== 'ward') { toggle('use', item.id); return; }
    ask({
      title: 'Активировать талисман?', text: 'Защита до конца акта. Талисман исчезнет.', okLabel: 'Активировать',
      onOk: () => void run({ type: 'item.use', itemId: item.id }),
    });
  };

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
      <h2 class="scr-h">Сумка <small>{items.length ? `${items.length} ${plural(items.length, 'вещь', 'вещи', 'вещей')}` : 'пусто'}</small></h2>
      <div class="res">
        <div class="gold"><Thumb src={resourceImageUrl('gold')} emoji={GOLD.emoji} size="md" /><b>{available.gold}</b><span>доступно</span></div>
        <div class="gold"><Thumb src={resourceImageUrl('gold')} emoji={GOLD.emoji} size="md" /><b>{player.reservedGold}</b><span>обещано</span></div>
        {INGREDIENTS.map(ing => (
          <div key={ing.key}>
            <Thumb src={resourceImageUrl(ing.key)} emoji={ing.emoji} size="md" />
            <b>{available.ingredients[ing.key]}</b><span>{ing.short}</span>
            {player.ingredients[ing.key] !== available.ingredients[ing.key] && (
              <em class="m-note">из {player.ingredients[ing.key]}</em>
            )}
          </div>
        ))}
      </div>
      <p class="m-note" style={{ margin: '-4px 6px 0' }}>Обещанное золото лежит в сделках и ставках до ответа.</p>

      {items.length === 0 && <p class="m-note" style={{ margin: '0 6px' }}>Вещей пока нет.</p>}
      {items.map(item => {
        const label = itemLabel(item, v);
        const usable = canUseItem(item, v);
        const reserved = !usable.ok && usable.why.startsWith('обещано') ? usable.why : '';
        const sub = [
          kindLabel(item.kind),
          item.createdBy ? `сделал ${roleName(item.createdBy, v)}` : '',
          reserved || (item.reservedFor ? 'обещано в сделке' : ''),
          item.kind === 'focus' ? 'кладётся на алтарь' : '',
        ].filter(Boolean).join(', ');
        const hasUse = item.kind === 'potion' || item.kind === 'ward' || item.kind === 'shape';
        return (
          <div key={item.id} class="item-block">
            <ItemCard emoji={label.emoji} img={itemImageUrl(item)} title={label.name} sub={sub} />
            <div class="m-btns">
              <Button small kind="sec" disabled={!canOffer(item, v)} onClick={() => offer(item)}>Предложить</Button>
              <Button small kind="sec" disabled={!canPutOnAltar(item, v) || v.altars.length === 0}
                onClick={() => toggle('altar', item.id)}>На алтарь</Button>
              {hasUse && <Button small kind="sec" disabled={!usable.ok} onClick={() => use(item)}>Использовать</Button>}
            </div>
            {hasUse && !usable.ok && !reserved && <p class="m-note">{usable.why}</p>}
            {useFor === item.id && usable.ok && <UseChoice v={v} item={item} onDone={() => setUseFor(null)} />}
            {altarFor === item.id && (
              <div class="choice">
                <span class="m-note">Какой алтарь?</span>
                {v.altars.map(a => (
                  <Button key={a.side} small onClick={() => toAltar(item, a)}>{a.name}</Button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {marks.length > 0 && (
        <div class="m-card">
          <h5>На вас действует</h5>
          {marks.map(m => <div class="m-row" key={m.label}><span>{m.label}</span><b>{m.value}</b></div>)}
        </div>
      )}
    </>
  );
}

/** Зелье и Камень: на себя или на другого (тогда просьба и вещь обещана до ответа). */
function UseChoice({ v, item, onDone }: { v: PlayerView; item: Item; onDone: () => void }) {
  const [guise, setGuise] = useState('');
  const shape = item.kind === 'shape';
  const name = guise.trim();
  const p = v.me.player;
  const send = (target?: string) => run({ type: 'item.use', itemId: item.id, ...(target ? { target } : {}), ...(shape ? { guise: name } : {}) })
    .then(r => { if (r.ok) onDone(); });
  const self = () => ask(shape
    ? { title: `Стать «${name}»?`, text: 'Камень исчезнет.', okLabel: 'Стать', onOk: () => void send() }
    : {
      title: 'Выпить Очищающее зелье?',
      text: p.curse || p.thorns ? 'Снимет проклятие и шипы.' : 'На вас нет проклятия и шипов, зелье исчезнет без пользы.',
      okLabel: 'Выпить', onOk: () => void send(),
    });
  const other = (k: string) => {
    const n = plainName(k, v);
    ask(shape
      ? { title: `Предложить ${nameCase(n, 'dat')} облик «${name}»?`, text: 'Камень будет обещан до ответа.', okLabel: 'Предложить', onOk: () => void send(k) }
      : { title: `Предложить ${nameCase(n, 'dat')} очищение?`, text: 'Зелье будет обещано до ответа.', okLabel: 'Предложить', onOk: () => void send(k) });
  };
  const ready = !shape || (name.length > 0 && name.length <= GUISE_MAX);
  return (
    <div class="choice">
      {shape && (
        <label class="field">
          <span>Новый облик</span>
          <input type="text" maxLength={GUISE_MAX} value={guise} placeholder="например, Странствующий лекарь"
            onInput={e => setGuise((e.currentTarget as HTMLInputElement).value)} />
          <em class="m-note">Скажите вслух, кем вы теперь выглядите.</em>
        </label>
      )}
      <span class="m-note">На кого?</span>
      <Button small disabled={!ready} onClick={self}>На себя</Button>
      <Select label="Другому участнику" value="" onChange={other} placeholder="другому участнику…" disabled={!ready}
        options={v.others.map(o => ({ value: o.roleKey, label: roleName(o.roleKey, v), avatar: o.roleKey, icon: roleEmoji(o.roleKey, v) }))} />
    </div>
  );
}
