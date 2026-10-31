import { useEffect, useState } from 'preact/hooks';
import type { Bundle, NarrativeTrade, PlayerView } from '@fair/shared';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { BASE } from '../base';
import '../trade-table.css';
import { Button } from '../components/Button';
import { FrozenNote, PauseNote } from '../components/Frozen';
import { Portrait } from '../components/Portrait';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { emptyBundle, INGREDIENTS, itemLabel, mmss, requestText, roleEmoji, roleName, waitingFor } from '../labels';
import { closePage, detailPage, openPage } from '../narrative-navigation';
import { canOffer, remainingMs, tradesPaused } from '../rules';
import { ask, now, run, tradeDraft } from '../store';
import { people, specialLabel } from './HiddenCommon';
import '../narrative-commerce.css';

const STATUS: Record<NarrativeTrade['status'], string> = { offered: 'Ждёт ответа', replied: 'Ждёт подтверждения автора', completed: 'Обмен завершён', declined: 'Отклонено', cancelled: 'Отменено', expired: 'Срок истёк' };
const empty = (b: Bundle) => !b.gold && !b.items.length && INGREDIENTS.every(i => !b.ingredients[i.key]);
export function validOwnGoods(b: Bundle, v: PlayerView): boolean {
  const valid = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
  return valid(b.gold, v.me.available.gold) && INGREDIENTS.every(i => valid(b.ingredients[i.key], v.me.available.ingredients[i.key]))
    && new Set(b.items).size === b.items.length && b.items.every(id => v.me.items.some(i => i.id === id && canOffer(i, v)));
}
export function tradeGoodsRows(b: Bundle, v: PlayerView, trade?: NarrativeTrade) {
  const rows: { id: string; name: string; image?: string; emoji: string; count: number }[] = [];
  if (b.gold) rows.push({ id: 'gold', name: 'Золото', image: resourceImageUrl('gold'), emoji: '◉', count: b.gold });
  for (const i of INGREDIENTS) if (b.ingredients[i.key]) rows.push({ id: i.key, name: i.name, image: resourceImageUrl(i.key), emoji: i.emoji, count: b.ingredients[i.key] });
  for (const id of b.items) {
    const it = trade?.items[id] ?? v.me.items.find(i => i.id === id);
    rows.push({ id, name: it ? specialLabel(it, v) : 'Предъявленная вещь', image: it && itemImageUrl(it), emoji: it ? itemLabel(it, v).emoji : '✦', count: 1 });
  }
  return rows;
}
function TableGoods({b,v,trade,emptyText}:{b:Bundle;v:PlayerView;trade?:NarrativeTrade;emptyText:string}) {
  const rows=tradeGoodsRows(b,v,trade);
  return rows.length ? <ul class="trade-table-goods">{rows.map(r=><li key={r.id}><Thumb src={r.image} emoji={r.emoji}/><b>×{r.count}</b><span>{r.name}</span></li>)}</ul> : <p class="trade-table-empty">{emptyText}</p>;
}
function ExchangeTable({v,from,to,give,reply,trade,draft=false}:{v:PlayerView;from:string;to:string;give:Bundle;reply?:Bundle;trade?:NarrativeTrade;draft?:boolean}) {
  return <div class="trade-table" aria-label="Стороны обмена">
    <div class="trade-table-person"><Portrait roleKey={from} emoji={roleEmoji(from,v)} size="card"/><strong>{roleName(from,v)}</strong><small>{from===v.me.role.key?'Вы предлагаете':'Предлагает вам'}</small></div>
    <span class="trade-table-arrow" aria-hidden="true">⇄</span>
    <div class="trade-table-person">{to?<Portrait roleKey={to} emoji={roleEmoji(to,v)} size="card"/>:<div class="trade-table-unknown" aria-hidden="true">?</div>}<strong>{to?roleName(to,v):'Ваш собеседник'}</strong><small>{to?'Встречное предложение':'Выберите героя выше'}</small></div>
    <section class="trade-table-offer" aria-label="Предложение автора"><TableGoods b={give} v={v} trade={trade} emptyText={draft?'Положите сюда вещи из сумки':'Без передачи вещей'}/></section>
    <section class="trade-table-offer" aria-label="Предложение адресата">{reply?<TableGoods b={reply} v={v} trade={trade} emptyText="Без встречных вещей"/>:<p class="trade-table-empty">{draft?'Здесь появится его ответ':'Ответ пока не получен'}</p>}</section>
  </div>;
}
function OwnGoods({ value, onChange, v }: { value: Bundle; onChange: (b: Bundle) => void; v: PlayerView }) {
  const resources = [{key:'gold' as const, name:'Золото', emoji:'◉'}, ...INGREDIENTS];
  return <div class="nc-own-goods">
    {resources.map(i => <div class={`nc-resource-edit ${(i.key==='gold'?value.gold:value.ingredients[i.key])>0?'selected':''}`} key={i.key}><span><Thumb src={resourceImageUrl(i.key)} emoji={i.emoji} size="sm" />{i.name}<small>Свободно: {i.key === 'gold' ? v.me.available.gold : v.me.available.ingredients[i.key]}</small></span><Stepper label={`Предложить: ${i.name}`} value={i.key === 'gold' ? value.gold : value.ingredients[i.key]} max={i.key === 'gold' ? v.me.available.gold : v.me.available.ingredients[i.key]} onChange={n => onChange(i.key === 'gold' ? {...value,gold:n} : {...value,ingredients:{...value.ingredients,[i.key]:n}})} /></div>)}
    {v.me.items.filter(i => canOffer(i,v)).map(i => <label class={`nc-item-choice ${value.items.includes(i.id)?'selected':''}`} key={i.id}><input type="checkbox" checked={value.items.includes(i.id)} onChange={e => onChange({...value,items:e.currentTarget.checked ? [...value.items,i.id] : value.items.filter(id => id !== i.id)})} /><Thumb src={itemImageUrl(i)} emoji={itemLabel(i,v).emoji} /><span>{specialLabel(i,v)}</span></label>)}
    {!validOwnGoods(value,v) && <p class="m-note warn">Часть выбранного уже недоступна. Обновите предложение.</p>}
  </div>;
}

export function NarrativeTrades({v}: {v:PlayerView}) {
  const trades = [...(v.hidden17?.narrative?.trades ?? [])].sort((a,b) => b.createdAt-a.createdAt);
  const page = detailPage.value;
  const selected = page?.kind === 'trade';
  const trade = selected ? trades.find(t => t.id === page.id) : undefined;
  return <div class="narrative-commerce">
    <div hidden={selected}>
      <div class="nc-place trade-place"><img src={`${BASE}assets/scenes/trades.webp`} alt="Обмен за столом ночной ярмарки"/><div><span>Слово за слово, вещь за вещь</span><h2>Сделки</h2><p>Предложите своё. Собеседник ответит, а последнее слово останется за вами.</p></div></div><FrozenNote v={v} />
      <ConsentRequests v={v} />
      <h3>На столе переговоров</h3>
      {!trades.some(t => ['offered','replied'].includes(t.status)) && <p class="text">Открытых предложений пока нет.</p>}
      {trades.filter(t => ['offered','replied'].includes(t.status)).map(t => <TradeLink key={t.id} trade={t} v={v} />)}
      <NewTrade v={v} />
      <h3>История обменов</h3>
      {!trades.some(t => !['offered','replied'].includes(t.status)) && <p class="text">Завершённые и отменённые предложения появятся здесь.</p>}
      {trades.filter(t => !['offered','replied'].includes(t.status)).map(t => <TradeLink key={t.id} trade={t} v={v} />)}
    </div>
    {selected && <><button type="button" class="nc-back" onClick={closePage}>← Назад к сделкам</button>{trade ? <TradePage key={trade.id} trade={trade} v={v} /> : <div class="m-card"><h2>Сделка недоступна</h2><p class="text">Возможно, она относится к другой партии или вы больше не её участник.</p></div>}</>}
  </div>;
}
function TradeLink({trade:t,v}:{trade:NarrativeTrade;v:PlayerView}) {
  const other = t.from === v.me.role.key ? t.to : t.from;
  return <div class="nc-trade-link"><Portrait roleKey={other} emoji={roleEmoji(other,v)} /><button type="button" class="nc-trade-open" onClick={() => openPage({kind:'trade',id:t.id})}><span><b>{roleName(other,v)}</b><small>{t.from === v.me.role.key ? 'Ваше предложение' : 'Предложение вам'} · {STATUS[t.status]}</small>{t.wish && <span class="nc-wish-preview">{t.wish}</span>}</span><span aria-hidden="true">→</span></button></div>;
}
function NewTrade({v}:{v:PlayerView}) {
  const [to,setTo] = useState(''); const [give,setGive] = useState<Bundle>(emptyBundle); const [wish,setWish] = useState(''); const [sending,setSending] = useState(false);
  const draft = tradeDraft.value;
  useEffect(() => { if (!draft) return; setGive(b => b.items.includes(draft.itemId) ? b : {...b,items:[...b.items,draft.itemId]}); tradeDraft.value = null; },[draft]);
  const submit = async () => { setSending(true); const result = await run({type:'narrative.trade.create',to,give,wish:wish.trim()}); setSending(false); if(result.ok){setGive(emptyBundle());setWish('');setTo('');} };
  return <section class="m-card nc-new-trade"><h3>Новое предложение</h3><label class="field"><span>Кому</span><Select label="Адресат сделки" value={to} onChange={setTo} placeholder="Выберите героя" options={people(v,false)} /></label><ExchangeTable v={v} from={v.me.role.key} to={to} give={give} draft/><h4 class="trade-packing-title">Добавьте на стол</h4><p class="m-note">Выберите вещи и количество из своей сумки.</p><OwnGoods value={give} onChange={setGive} v={v} /><label class="field"><span>Что хотите получить</span><textarea value={wish} maxLength={500} rows={3} placeholder="Напишите пожелание или оставьте пустым для подарка" onInput={e => setWish(e.currentTarget.value)} /></label><p class="m-note">Выбранное будет зарезервировано. Текст — пожелание, а не гарантия услуги. Обмен пройдёт после вашего подтверждения ответного предложения.</p>{tradesPaused(v) ? <PauseNote /> : <Button disabled={!to || !v.others.some(o=>o.roleKey===to) || empty(give) || !validOwnGoods(give,v) || sending} onClick={() => ask({title:'Отправить предложение?',text:'Ваши вещи и ресурсы останутся обещанными до завершения или отмены сделки.',okLabel:'Отправить',onOk:()=>void submit()})}>Предложить обмен или подарок</Button>}</section>;
}
function TradePage({trade:t,v}:{trade:NarrativeTrade;v:PlayerView}) {
  const [reply,setReply] = useState<Bundle>(emptyBundle); const [sending,setSending] = useState(false);
  const author = t.from === v.me.role.key; const active = t.status === 'offered' || t.status === 'replied'; const paused = tradesPaused(v);
  const replyNow = async () => { setSending(true); await run({type:'narrative.trade.reply',id:t.id,give:reply});setSending(false); };
  return <article class="m-card nc-trade-page"><h2>{roleName(t.from,v)} → {roleName(t.to,v)}</h2><p class="nc-status">{STATUS[t.status]}{active && ` · осталось ${mmss(Math.max(0,remainingMs(t.expiresAt,v.clock,now.value)))}`}</p><FrozenNote v={v}/>{paused && <PauseNote />}
    <ExchangeTable v={v} from={t.from} to={t.to} give={t.give} reply={t.reply??(!author&&t.status==='offered'?reply:undefined)} trade={t}/>{active&&<p class="m-note">Вещи остаются обещанными до окончательного подтверждения автора.</p>}
    <section><h3>Пожелание автора</h3><p class="text nc-prewrap">{t.wish || 'Подарок — встречное предложение не требуется.'}</p><p class="m-note">Договорённость об услуге выполняется лично. Приложение передаёт только перечисленные вещи и ресурсы.</p></section>
    {t.reply&&active&&<p class="m-note">Ответ отправлен. Изменить его уже нельзя.</p>}
    {!author && t.status === 'offered' && <section><h3>Ваш ответ</h3><OwnGoods value={reply} onChange={setReply} v={v}/><p class="m-note">После ответа автор проверит обе стороны и подтвердит передачу.</p><Button disabled={paused || !validOwnGoods(reply,v) || sending} onClick={() => ask({title:empty(reply)?'Получить в подарок?':'Предложить это в ответ?',text:'Ответ нельзя изменить. Выбранное будет обещано до решения автора.',okLabel:empty(reply)?'Получить в подарок':'Предложить в ответ',onOk:()=>void replyNow()})}>{empty(reply)?'Получить в подарок':'Предложить в ответ'}</Button></section>}
    {author && t.status === 'replied' && <Button disabled={paused} onClick={() => ask({title:'Подтвердить обмен?',text:'Обе стороны перейдут одновременно. Проверьте перечисленные предметы и количества.',okLabel:'Подтвердить обмен',onOk:()=>void run({type:'narrative.trade.confirm',id:t.id})})}>Подтвердить обмен</Button>}
    {author && t.status === 'offered' && <p class="text">Ждём ответа собеседника.</p>}
    {!author && t.status === 'replied' && <p class="text">Ждём окончательного решения автора.</p>}
    {active && <Button kind="sec" onClick={() => ask({title:'Отказаться от сделки?',text:'Резервы обоих участников освободятся.',okLabel:'Отказаться',onOk:()=>void run({type:author && t.status==='offered'?'narrative.trade.cancel':'narrative.trade.decline',id:t.id})})}>{author && t.status==='offered'?'Отменить предложение':'Отказаться от сделки'}</Button>}
  </article>;
}
function ConsentRequests({v}:{v:PlayerView}) {
  const me=v.me.role.key; const pending=v.requests.filter(r=>r.status==='pending');
  if (!pending.length) return null;
  return <section><h3>Просьбы о согласии</h3>{pending.map(r=><div class="m-card" key={r.id}><p class="text">{requestText(r,v)}</p><p class="m-note">От {roleName(r.author,v)}. Ждём: {waitingFor(r).map(k=>roleName(k,v)).join(', ')}.</p>{r.author===me ? <Button kind="sec" onClick={()=>void run({type:'consent.cancel',id:r.id})}>Отозвать просьбу</Button> : !r.approved.includes(me) && <div class="m-btns"><Button disabled={tradesPaused(v)} onClick={()=>ask({title:'Дать согласие?',text:requestText(r,v),okLabel:'Согласен',onOk:()=>void run({type:'consent.accept',id:r.id})})}>Согласен</Button><Button kind="sec" onClick={()=>void run({type:'consent.decline',id:r.id})}>Отказаться</Button></div>}</div>)}</section>;
}
