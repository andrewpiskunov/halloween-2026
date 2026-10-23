import type { Lot, PlayerView } from '@fair/shared';
import { ItemCard } from '../components/ItemCard';
import { GOLD, itemLabel } from '../labels';

const LOT_STATUS: Record<Lot['status'], string> = {
  queued: 'в очереди', announced: 'объявлен', openBidding: 'открытый торг', sealedBidding: 'закрытые ставки',
  fixedPrice: 'фиксированная цена', sold: 'продан', unsold: 'не продан',
};

/** События: объявления ведущего и лоты — только для справки. */
export function Events({ v }: { v: PlayerView }) {
  const me = v.me.role.key;
  return (
    <>
      <div class="m-card">
        <h5>📜 Сюжет</h5>
        <p class="text">{v.public.story}</p>
      </div>
      {v.lots.length > 0 && (
        <div class="m-card">
          <h5>📣 Лоты</h5>
          {v.lots.map(l => {
            const myBid = l.bids.find(b => b.player === me);
            return (
              <div class="item-block" key={l.id}>
                <div class="m-row"><span>Лот акта {l.act}</span><b>{LOT_STATUS[l.status]}</b></div>
                {l.items.map(i => { const lb = itemLabel(i, v); return <ItemCard key={i.id} emoji={lb.emoji} title={lb.name} />; })}
                {l.fixedPrice !== undefined && <div class="m-row"><span>Цена</span><b>{GOLD.emoji} {l.fixedPrice}</b></div>}
                {myBid && <div class="m-row"><span>Ваша ставка</span><b>{GOLD.emoji} {myBid.amount}</b></div>}
              </div>
            );
          })}
          <p class="m-note">Лоты здесь только для справки.</p>
        </div>
      )}
      {v.announcements.length === 0 && <div class="m-card"><p class="m-note">Объявлений пока нет.</p></div>}
      {[...v.announcements].reverse().map((a, i) => (
        <div class="m-card" key={`${a.at}-${i}`}>
          <h5>📣 {new Date(a.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</h5>
          <b>{a.title}</b>
          <p class="text">{a.text}</p>
        </div>
      ))}
    </>
  );
}
