import type { Lot, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { ItemCard } from '../components/ItemCard';
import { goldText, itemLabel, roman } from '../labels';

const LOT_STATUS: Record<Lot['status'], string> = {
  queued: 'в очереди', announced: 'объявлен', openBidding: 'открытый торг', sealedBidding: 'закрытые ставки',
  fixedPrice: 'фиксированная цена', sold: 'продан', unsold: 'не продан',
};

/** События: сюжет, лоты для справки и лента объявлений ведущего, записанных от руки. */
export function Events({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  return (
    <>
      <h2 class="scr-h">События</h2>
      <div class="m-card">
        <h5>Сюжет</h5>
        <p class="text">{v.public.story}</p>
      </div>
      {v.lots.length > 0 && (
        <div class="m-card">
          <h5>Лоты</h5>
          {v.lots.map(l => {
            const myBid = l.bids.find(b => b.player === me);
            return (
              <div class="lot" key={l.id}>
                <div class="m-row"><span>Лот акта {roman(l.act)}</span><b>{LOT_STATUS[l.status]}</b></div>
                {l.items.map(i => { const lb = itemLabel(i, v); return <ItemCard key={i.id} emoji={lb.emoji} img={itemImageUrl(i)} title={lb.name} />; })}
                {l.fixedPrice !== undefined && <div class="m-row"><span>Цена</span><b>{goldText(l.fixedPrice)}</b></div>}
                {myBid && <div class="m-row"><span>Ваша ставка</span><b>{goldText(myBid.amount)}</b></div>}
              </div>
            );
          })}
          <p class="m-note">Лоты здесь только для справки.</p>
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
