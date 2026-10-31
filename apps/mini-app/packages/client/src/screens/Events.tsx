import { PlayerStory } from './Story';
import { useState } from 'preact/hooks';
import type { Lot, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { Button } from '../components/Button';
import { Frozen, frozenReason, FrozenNote } from '../components/Frozen';
import { ItemCard } from '../components/ItemCard';
import { Stepper } from '../components/Stepper';
import { goldText, itemLabel, lotTitle, mmss, plural, roleName, roman } from '../labels';
import { bidBounds, remainingMs } from '../rules';
import { ask, now, run } from '../store';

const LOT_STATUS: Record<Lot['status'], string> = {
  queued: 'в очереди', announced: 'объявлен', openBidding: 'открытый торг', sealedBidding: 'закрытые ставки',
  fixedPrice: 'фиксированная цена', sold: 'продан', unsold: 'не продан',
};

/** События: сюжет, лоты для справки и лента объявлений ведущего, записанных от руки. */
export function Events({ v }: { v: PlayerView }) {
  return (
    <>
      <h2 class="scr-h">События</h2>
      <FrozenNote v={v} />
      <Frozen.Provider value={frozenReason(v)}><PlayerStory v={v} /></Frozen.Provider>
      <div class="m-card">
        <h5>Сюжет</h5>
        <p class="text">{v.public.story}</p>
      </div>
      {v.lots.length > 0 && (
        <div class="m-card">
          <h5>Лоты</h5>
          {v.lots.map(l => <LotCard key={l.id} l={l} v={v} />)}
        </div>
      )}
      <h2 class="scr-h">Объявления</h2>
      {v.announcements.length === 0 && <p class="m-note" style={{ margin: '0 6px' }}>Объявлений пока нет.</p>}
      <div class="feed">
        {[...v.announcements].reverse().map((a, i) => (
          <div class="m-card" key={`${a.at}-${i}`}>
            <time>{new Date(a.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
            <b>{a.title}</b>
            <p class="hand">{a.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}

type LotView = PlayerView['lots'][number];

/** Лот: статус с отсчётом, вещи, своя ставка и действия: закрытая ставка или выкуп. */
export function LotCard({ l, v }: { l: LotView; v: PlayerView }) {
  const me = v.me.role.key;
  const title = lotTitle(l.items, v);
  const until = l.status === 'openBidding' ? l.openUntil : l.status === 'sealedBidding' ? l.sealedUntil : undefined;
  const left = until === undefined ? 0 : Math.max(0, remainingMs(until, v.clock, now.value));
  const bounds = bidBounds(l, v);
  const [amount, setAmount] = useState(0);
  const chosen = Math.min(bounds.max, Math.max(bounds.min, amount || bounds.min));
  const canBid = l.status === 'sealedBidding' && (left > 0 || v.clock.paused) && bounds.max >= bounds.min;
  const bid = () => ask({
    title: `${bounds.mine ? 'Поднять ставку до' : 'Поставить'} ${goldText(chosen)}?`,
    text: `${title}. Ставку видит только сервер; золото будет обещано до конца торга.`,
    okLabel: bounds.mine ? 'Поднять' : 'Поставить',
    onOk: () => void run({ type: 'lot.bid', id: l.id, amount: chosen }),
  });
  const buyout = () => ask({
    title: `Выкупить ${title} за ${goldText(l.fixedPrice ?? 0)}?`, okLabel: 'Выкупить',
    onOk: () => void run({ type: 'lot.buyout', id: l.id }),
  });
  return (
    <div class="lot">
      <div class="m-row">
        <span>Лот акта {roman(l.act)}</span>
        <b>{LOT_STATUS[l.status]}{until !== undefined && ` · ${mmss(left)}`}</b>
      </div>
      {l.items.map(i => { const lb = itemLabel(i, v); return <ItemCard key={i.id} emoji={lb.emoji} img={itemImageUrl(i)} title={lb.name} />; })}
      {l.status === 'openBidding' && <p class="m-note">Торгуйтесь голосом; ставки в приложении откроет ведущий.</p>}
      {l.status === 'sealedBidding' && (
        <>
          <div class="m-row">
            <span>{l.bidders ? `${l.bidders} ${plural(l.bidders, 'ставка', 'ставки', 'ставок')}` : 'ставок пока нет'}</span>
            {bounds.mine > 0 && <b>ваша {goldText(bounds.mine)}</b>}
          </div>
          {canBid
            ? (
              <div class="m-row lot-bid">
                <Stepper value={chosen} min={bounds.min} max={bounds.max} onChange={setAmount} label="Ставка" />
                <Button onClick={bid}>{bounds.mine ? 'Поднять' : 'Поставить'}</Button>
              </div>
            )
            : <p class="m-note">{bounds.max < bounds.min ? 'Свободного золота на ставку нет.' : 'Окно ставок закрыто.'}</p>}
        </>
      )}
      {l.status === 'fixedPrice' && l.fixedPrice !== undefined && (
        <div class="m-row lot-bid">
          <span>Ставок не было: цена {goldText(l.fixedPrice)}</span>
          <Button disabled={v.me.available.gold < l.fixedPrice} onClick={buyout}>Выкупить</Button>
        </div>
      )}
      {l.status === 'sold' && l.winner !== undefined && (
        <div class="m-row"><span>Ушёл</span><b>{l.winner === me ? 'вам' : roleName(l.winner, v)} за {goldText(l.price ?? 0)}</b></div>
      )}
    </div>
  );
}
