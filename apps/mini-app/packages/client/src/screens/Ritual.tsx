import { shardNumber } from '../shard-label';
import { ItemText } from '../components/ItemText';
import { BASE } from '../base';
import { navigateTab, openPage } from '../narrative-navigation';
import { useState } from 'preact/hooks';
import type { HiddenChoice, HiddenMethod, HiddenOrder, HiddenOutcome, Item, PlayerView } from '@fair/shared';
import { itemImageUrl } from '../assets';
import { Button } from '../components/Button';
import { ItemCard } from '../components/ItemCard';
import { Select } from '../components/Select';
import { Portrait } from '../components/Portrait';
import { ask, run } from '../store';
import { HiddenItem, ORDERS, SPECIAL_NAMES, STEPS, people, specialLabel } from './HiddenCommon';
import { roleName } from '../labels';

export function Ritual({ v }: { v: PlayerView }) {
  const h = v.hidden17!; const r = h.ritual;
  const available = v.me.items.filter(i => v.me.available.items.includes(i.id));
  const owned = v.me.items.filter(i => i.kind === 'shard' || i.kind === 'focus');
  const name = (id: string) => { const it = v.me.items.find(i => i.id === id) ?? h.knownItems[id]; return it ? specialLabel(it, v) : 'предъявленная часть'; };
  const offer = (it: Item, include: boolean) => ask({ title: `${include ? 'Положить в круг' : 'Отозвать'}: ${name(it.id)}?`, text: include ? 'Вещь остаётся вашей. При рассыпании пыли Фокусы исчезнут. Осколок в круге может пострадать от чужого вмешательства.' : 'Вы забираете только свою вещь.', okLabel: include ? 'Положить' : 'Отозвать', onOk: () => void run({ type: 'hidden17.ritual.offer', itemId: it.id, include }) });
  return <>
    {h.narrative ? <><header class="narrative-scene"><img src={`${BASE}assets/scenes/outpost.webp`} alt="Старая каменная застава у реки"/><div><span class="narrative-eyebrow">За краем ярмарки</span><h2>Старая застава</h2></div></header>{r.step === 'preparation' && <div class="m-card"><h5>{h.narrative.knowledge.includes('place') ? 'Место гибели Сарна' : 'У обвалившейся стены'}</h5><p class="text"><ItemText>Между корнями лежит тяжёлая каменная плита. Ветер с реки едва слышен за стеной. Здесь давно никто не живёт.</ItemText></p><p class="m-note"><ItemText>{h.narrative.knowledge.includes('joining') ? 'Вы узнали способ возвращения Сарна. Для попытки нужны союзники и материалы из записи. Удастся ли обряд, пока неизвестно.' : h.narrative.knowledge.includes('place') ? 'Вы знаете, чьи останки лежат под плитой. Что ещё можно здесь сделать, предстоит выяснить.' : 'Чужие рассказы, найденные свидетельства и ваш собственный осмотр могут открыть историю этого места.'}</ItemText></p><button class="narrative-back" onClick={() => navigateTab('events')}>Предложить ведущему свой осмотр или действие →</button></div>}</> : <h2 class="scr-h">Могила Сарна <small>{STEPS[r.step]}</small></h2>}
    {!h.narrative && <div class="m-card ritual-stone"><h5>Надпись у обвалившейся стены</h5><ol class="list">{r.stone.map(s => <li key={s}><ItemText>{s}</ItemText></li>)}</ol><p class="m-note"><ItemText>Инструкция доступна каждому у могилы. Знать историю Сарна наизусть не требуется.</ItemText></p></div>}
    {r.step === 'preparation' && <Preparation v={v} />}
    {r.step !== 'preparation' && r.step !== 'finished' && <div class="m-card"><h5>Ритуал начался</h5><p class="text"><ItemText>Обычные сделки, изготовление и способности завершены. Теперь действуют только шаги обряда и заранее подготовленные вещи.</ItemText></p></div>}
    {['assembly', 'powder', 'choices', 'responses', 'last-choice'].includes(r.step) && <div class="m-card"><h5>В круге</h5><div class="ritual-slots">{['I', 'II', 'III', 'IV', 'V'].map(ref => {
      const id = r.circle.find(id => h.knownItems[id]?.ref === ref || v.me.items.find(i => i.id === id)?.ref === ref);
      const broken = r.extinguished.includes(ref);
      return <div class={`ritual-slot ${id ? 'filled' : ''} ${broken ? 'broken' : ''}`} key={ref}><span>{shardNumber(ref)}</span>{id && <img src={itemImageUrl({ kind: 'shard', ref })} alt={`Осколок ${shardNumber(ref)}`} />}<small>{broken ? 'погашен' : id ? 'в круге' : 'нет в круге'}</small></div>;
    })}</div><p class="m-note"><ItemText>{r.step === 'assembly' ? `Фокусов предложено: ${r.focuses.length} из 2.` : 'Два Фокуса израсходованы на пыль.'} Кто хранит остальные части, здесь не показано.</ItemText></p></div>}
    {['assembly', 'last-choice'].includes(r.step) && <div class="m-card"><h5>Ваши части {r.step === 'assembly' && 'и Фокусы'}</h5>
      {owned.filter(i => r.step === 'assembly' || i.kind === 'shard').map(it => { const included = r.circle.includes(it.id) || r.focuses.includes(it.id); return <ItemCard key={it.id} title={name(it.id)} emoji="✦" img={itemImageUrl(it)} sub={r.extinguished.includes(it.ref) ? 'погашен' : included ? 'вы положили в круг' : 'у вас'}><Button small disabled={r.extinguished.includes(it.ref) || (!included && !available.some(a => a.id === it.id))} onClick={() => offer(it, !included)}>{included ? 'Отозвать' : 'Положить'}</Button></ItemCard>; })}
      {!owned.length && <p class="m-note"><ItemText>У вас нет подходящих вещей. Вы можете договариваться, наблюдать и поддерживать обряд.</ItemText></p>}
    </div>}
    {r.step === 'powder' && !!r.formula && <div class="m-card"><h5>Произнесите у могилы</h5><blockquote><ItemText>{r.formula}</ItemText></blockquote><p class="m-note"><ItemText>Произнесите слова из известного вам источника вслух, затем подтвердите действие.</ItemText></p><Button onClick={() => void run({ type: 'hidden17.ritual.formula', text: r.formula })}>Формула произнесена</Button></div>}
    {!h.narrative && ['preparation', 'assembly', 'powder', 'choices'].includes(r.step) && v.me.items.some(i => i.kind === 'shard') && <ShardPermission v={v} />}
    {r.step === 'choices' && <Choice v={v} />}
    {r.step === 'last-choice' && r.orderOptions.length > 1 && <div class="m-card"><h5>Один из ваших записанных приказов</h5><p class="text"><ItemText>На знаках несколько распоряжений с вашим именем. Выберите одно, которое вступит в силу при возвращении.</ItemText></p>{r.orderOptions.map(order => <Button key={order} kind={r.orderSelected === order ? 'main' : 'sec'} onClick={() => void run({ type: 'hidden17.ritual.order', order })}>{ORDERS.find(o => o.value === order)?.label}</Button>)}</div>}
    {r.step === 'responses' && <Responses v={v} />}
    {r.observed.length > 0 && <div class="m-card"><h5>Что произошло у могилы</h5><ol class="list">{r.observed.map((s, i) => <li key={i}><ItemText>{s}</ItemText></li>)}</ol></div>}
    {r.outcome && <Outcome outcome={r.outcome} name={k => roleName(k, v)} />}
  </>;
}
function Preparation({ v }: { v: PlayerView }) {
  const h=v.hidden17!;
  const [chosenMethod,setMethod]=useState<HiddenMethod>(h.knownMethods[0]??'salt');
  const method=h.knownMethods.includes(chosenMethod)?chosenMethod:h.knownMethods[0]??'salt';
  const [itemId,setItem]=useState(''),[order,setOrder]=useState<HiddenOrder>('leave');
  const [controller,setController]=useState(v.me.role.key),[forOther,setForOther]=useState(false);
  const [pending,setPending]=useState(false),[message,setMessage]=useState('');
  const source=v.me.items.filter(i=>v.me.available.items.includes(i.id)&&i.kind===(method==='sign'?'focus':'potion'));
  const selected=source.some(i=>i.id===itemId)?itemId:source[0]?.id??'';
  const owner=forOther?controller:v.me.role.key;
  const sign=h.methods.find(m=>m.id==='command');
  const title=method==='sign'?'Начертить знак на Фокусе':method==='salt'?'Приготовить разрывную соль':'Подготовить отводящий сосуд';
  const material=method==='sign'?'Фокус силы':'Очищающее зелье';
  const prepare=()=>ask({title:`${title}?`,text:method==='sign'?`Один Фокус силы станет знаком. Имя: ${roleName(owner,v)}. Приказ: «${ORDERS.find(o=>o.value===order)?.label}». Готовый знак появится в сумке.`:`Одно Очищающее зелье будет потрачено. ${SPECIAL_NAMES[method]} появится в сумке.`,okLabel:method==='sign'?'Начертить знак':'Подготовить',onOk:async()=>{
    setPending(true);setMessage('');
    try{const r=await run({type:'hidden17.prepare',method,itemId:selected,...(method==='sign'?{controller:owner,order}:{})});if(r.ok){setItem('');setMessage(`${SPECIAL_NAMES[method]} готов. Он находится в вашей сумке.`);}}finally{setPending(false);}
  }});
  return <>
    {!h.narrative&&<div class="m-card"><h5>До первого удара</h5><p class="text"><ItemText>{h.ritual.stone.slice(1,3).join(' ')}</ItemText></p></div>}
    {sign&&<section class="m-card ritual-instruction"><h5>Из записей Орвика: знак на Фокусе</h5><p class="text"><ItemText>Знак связывает Фокус с именем человека и одним приказом. Если Сарн вернётся, эта связь может заставить его исполнить записанное до рассвета.</ItemText></p>
      <ol class="list"><li><ItemText>Достаньте отдельный Фокус силы — купите, обменяйте или закажите в мастерской.</ItemText></li><li><ItemText>Начертите на нём своё имя и запишите один приказ. Ниже вы можете подготовить такой знак.</ItemText></li><li><ItemText>Возьмите знак к могиле. После первого удара сердца выберите его среди своих действий в обряде.</ItemText></li></ol>
      <p class="m-note"><ItemText>До подключения знак просто лежит в сумке. Сам по себе он не пробуждает Сарна.</ItemText></p>
      <details><summary>Что может сорвать замысел</summary><p class="text"><ItemText>Защитный талисман может оборвать связь. Если к сердцу подключат знаки с разными именами, они сорвут друг друга. Несколько знаков на одно имя всё равно дают лишь один приказ.</ItemText></p><p class="m-note"><ItemText>{sign.tell}</ItemText></p></details>
    </section>}
    {h.methods.filter(m=>m.id!=='command').map(m=><details class="m-card secret-method" key={m.id}><summary>{m.title} · ваше знание</summary><p class="text"><ItemText>{m.private}</ItemText></p><p class="text"><ItemText><b>Цена:</b> {m.cost}</ItemText></p><p class="m-note"><ItemText>{m.tell}</ItemText></p><p class="m-note"><ItemText>{m.counter}</ItemText></p><p class="text"><ItemText>{m.result}</ItemText></p></details>)}
    {h.knownMethods.length>0&&<section class="m-card ritual-preparation"><h5>{title}</h5>
      {h.knownMethods.length>1&&<div class="field"><span>Что подготовить</span><Select label="Способ подготовки" value={method} disabled={pending} onChange={s=>{setMethod(s as HiddenMethod);setItem('');setMessage('');}} options={h.knownMethods.map(m=>({value:m,label:SPECIAL_NAMES[m]}))}/></div>}
      {!source.length?<><p class="text"><ItemText>Вам нужен {material}. Сначала получите его, затем вернитесь сюда.</ItemText></p><button class="m-btn sec" type="button" onClick={()=>{navigateTab('workshop');if(h.narrative)openPage({kind:'recipe',id:method==='sign'?'focus':'cleanse'});}}>Заказать {method==='sign'?'Фокус':'зелье'} в мастерской</button></>:source.length===1?<p class="text">Материал: <HiddenItem item={source[0]} v={v}/></p>:<div class="field"><span>Выберите свой материал</span><Select label="Сырьё для подготовки" value={selected} onChange={setItem} disabled={pending} options={source.map(i=>({value:i.id,label:specialLabel(i,v),image:itemImageUrl(i)}))}/></div>}
      {method==='sign'&&source.length>0&&<><p class="text">На знаке будет имя: <b>{roleName(owner,v)}</b>.</p><fieldset class="ritual-orders" disabled={pending}><legend>Какой приказ записать?</legend>{ORDERS.map(o=><label key={o.value}><input type="radio" name="sign-order" value={o.value} checked={order===o.value} onChange={()=>setOrder(o.value)}/><span>{o.label}</span></label>)}</fieldset>
        <details class="ritual-other-name"><summary>Подготовить знак для другого героя</summary><label class="check"><input type="checkbox" checked={forOther} disabled={pending} onChange={e=>setForOther(e.currentTarget.checked)}/><span>Указать чужое имя вместо своего</span></label>{forOther&&<Select label="Управляющий знаком" value={controller} onChange={setController} disabled={pending} options={people(v)}/>}</details>
        <p class="m-note">Имя и приказ останутся на готовом знаке — изменить их в финале нельзя.</p>
      </>}
      {source.length>0&&<Button disabled={!selected||pending} onClick={prepare}>{pending?'Подготавливаем…':title}</Button>}
      {message&&<p class="text" role="status"><ItemText>{message}</ItemText></p>}
    </section>}
    {(!h.narrative||v.me.items.some(i=>!!h.prepared[i.id]))&&<div class="m-card"><h5>Подготовленные вещи</h5>{v.me.items.filter(i=>!!h.prepared[i.id]).map(i=><p key={i.id}><HiddenItem item={i} v={v}/>{h.prepared[i.id].controller&&<small class="m-note"> · {roleName(h.prepared[i.id].controller!,v)} · {ORDERS.find(o=>o.value===h.prepared[i.id].order)?.label}</small>}</p>)}<p class="m-note">Если другой герой научил вас этому способу, попросите ведущего отметить, что теперь вы его знаете.</p></div>}
  </>;
}

function Choice({ v }: { v: PlayerView }) {
  const h = v.hidden17!; const r = h.ritual;
  const [kind, setKind] = useState<HiddenChoice['kind']>('pass'); const [itemId, setItem] = useState(''); const [targetId, setTarget] = useState('');
  const [withdraw, setWithdraw] = useState<string[]>([]);
  const items = v.me.items.filter(i => i.kind === 'special' && h.prepared[i.id]?.method === kind && v.me.available.items.includes(i.id));
  const id = items.some(i => i.id === itemId) ? itemId : items[0]?.id ?? '';
  const salts = h.ritual.accessibleShards;
  const target = salts.includes(targetId) ? targetId : salts[0] ?? '';
  const own = v.me.items.filter(i => i.kind === 'shard' && r.circle.includes(i.id));
  const options = [{ value: 'pass', label: 'Поддержать / наблюдать' }, ...(own.length ? [{ value: 'withdraw', label: 'Отозвать свои части' }] : []), ...(['salt', 'sign', 'vessel'] as const).filter(m => v.me.items.some(i => h.prepared[i.id]?.method === m)).map(m => ({ value: m, label: SPECIAL_NAMES[m] }))];
  const valid = kind === 'pass' || (kind === 'withdraw' ? withdraw.length > 0 : !!id && (kind !== 'salt' || !!target));
  return <div class="m-card"><h5>Ваш скрытый выбор</h5><p class="text"><ItemText>Один выбор на участника. Остальные увидят действие только при раскрытии. Если ничего не отправить — вы поддерживаете обряд.</ItemText></p>
    {r.myChoice && <p class="m-note"><ItemText>Записано: {r.myChoice.kind === 'pass' ? 'поддержать' : r.myChoice.kind === 'withdraw' ? 'отозвать части' : SPECIAL_NAMES[r.myChoice.kind]}.</ItemText></p>}
    <Select label="Действие в ритуале" value={kind} onChange={s => { setKind(s as HiddenChoice['kind']); setItem(''); }} options={options} />
    {['salt', 'sign', 'vessel'].includes(kind) && <div class="field"><span>Предмет</span><Select label="Подготовленный предмет" value={id} onChange={setItem} options={items.map(i => ({ value: i.id, label: specialLabel(i, v) }))} /></div>}
    {kind === 'salt' && <div class="field"><span>Доступная часть</span><Select label="Цель соли" value={target} onChange={setTarget} options={salts.map(id => ({ value: id, label: `Осколок ${shardNumber(h.knownItems[id]?.ref ?? v.me.items.find(i => i.id === id)?.ref ?? '?')}`, image: itemImageUrl({ kind: 'shard', ref: '' }) }))} /></div>}
    {kind === 'withdraw' && own.map(i => <label class="check hidden-check" key={i.id}><input type="checkbox" checked={withdraw.includes(i.id)} onChange={e => setWithdraw(e.currentTarget.checked ? [...withdraw, i.id] : withdraw.filter(id => id !== i.id))} /><HiddenItem item={i} v={v} /></label>)}
    <Button disabled={!valid || !!r.myChoice} onClick={() => void run({ type: 'hidden17.ritual.choice', kind, ...(['salt', 'sign', 'vessel'].includes(kind) ? { itemId: id } : {}), ...(kind === 'salt' ? { targetId: target } : {}), ...(kind === 'withdraw' ? { shardIds: withdraw } : {}) })}>{r.myChoice ? 'Выбор запечатан' : 'Сохранить скрытый выбор'}</Button>
  </div>;
}
function Responses({ v }: { v: PlayerView }) {
  const h = v.hidden17!; const r = h.ritual;
  const wards = v.me.items.filter(i => i.kind === 'ward' && (v.me.available.items.includes(i.id) || i.reservedFor === 'hidden17:ward'));
  const [ward, setWard] = useState(''); const id = wards.some(w => w.id === ward) ? ward : wards[0]?.id ?? '';
  return <div class="m-card"><h5>Окно ответа · 2 минуты</h5><p class="text"><ItemText>Вы можете отменить своё вмешательство, но потраченный предмет не вернётся. Каждый участник вправе остановить одну попытку своим неиспользованным талисманом.</ItemText></p>
    {r.myChoice?.status === 'active' && <Button kind="sec" onClick={() => ask({ title: 'Отменить своё вмешательство?', text: 'Компонент не вернётся. Выбрать новое действие нельзя.', okLabel: 'Отказаться', onOk: () => void run({ type: 'hidden17.ritual.cancel' }) })}>Отказаться от своего вмешательства</Button>}
    {wards.length > 0 && <div class="field"><span>Ваш талисман</span><Select label="Талисман для ответа" value={id} onChange={setWard} options={wards.map(w => ({ value: w.id, label: 'Защитный талисман', image: itemImageUrl(w) }))} /></div>}
    {r.interventions.map(c => <div class="ritual-attempt" key={c.player}><div class="item"><Portrait roleKey={c.player} emoji="☉" size="sm" /><div class="item-text"><b>{roleName(c.player, v)} · {SPECIAL_NAMES[c.kind] ?? 'отзыв'}</b><span>{c.targetId ? `Осколок ${shardNumber(h.knownItems[c.targetId]?.ref ?? '?')}` : c.controller ? `Имя на знаке: ${roleName(c.controller, v)}` : 'Подключение к кругу'}</span></div></div><p class="m-note"><ItemText>{c.status === 'active' ? 'Действует, если её не остановят' : c.status === 'cancelled' ? 'Автор отказался' : c.status === 'blocked' ? 'Остановлена талисманом' : 'Не действует'}</ItemText></p>
      {c.status === 'active' && <Button small disabled={!id} onClick={() => ask({ title: 'Защитить от этой попытки?', text: 'Один талисман останавливает одну попытку. При нескольких щитах на одну цель тратится только один.', okLabel: 'Выбрать защиту', onOk: () => void run({ type: 'hidden17.ritual.ward', itemId: id, against: c.player }) })}>Остановить талисманом</Button>}
    </div>)}
    {!r.interventions.length && <p class="m-note"><ItemText>Вмешательств нет. Ведущий перейдёт к последнему выбору.</ItemText></p>}
  </div>;
}
export function Outcome({ outcome: o, name }: { outcome: HiddenOutcome; name: (key: string) => string }) {
  return <div class="m-card outcome hidden-outcome"><h5>Что изменилось</h5><dl><dt>Жизнь</dt><dd><ItemText>{o.life === 'awake' ? 'Сарн вернулся' : o.life === 'destroyed' ? 'Сердце уничтожено' : 'Сердце уснуло'}</ItemText></dd><dt>Свобода</dt><dd><ItemText>{o.life !== 'awake' ? 'Связь не возникла' : o.freedom === 'free' ? 'Сарн свободен' : `${name(o.controller!)}: ${ORDERS.find(x => x.value === o.order)?.label ?? 'одно ограниченное распоряжение'} до рассвета`}</ItemText></dd><dt>Сила</dt><dd><ItemText>{o.life !== 'awake' ? 'Сосуды пусты' : o.power === 'whole' ? 'Сила осталась у Сарна' : o.power === 'full' ? 'Один сосуд получил полную порцию' : o.power === 'weak' ? 'Сосуды получили слабые остатки' : 'Сосуды пусты'}</ItemText></dd></dl><p class="m-note"><ItemText>Ведущий отдельно оценит личные цели. В эпилоге вы можете рассказать свои тайны, если захотите.</ItemText></p></div>;
}

function ShardPermission({ v }: { v: PlayerView }) {
  const [id, setId] = useState(''); const [player, setPlayer] = useState('');
  return <details class="m-card"><summary>Дать доступ к своей части вне круга</summary><p class="m-note"><ItemText>Вы разрешаете выбранному герою провести обряд над вашей частью сердца. Она остаётся вашей. Пока действия не раскрыты, разрешение можно отозвать.</ItemText></p><Select label="Часть для разрешения" value={id} onChange={setId} options={v.me.items.filter(i => i.kind === 'shard').map(i => ({ value: i.id, label: specialLabel(i, v) }))} /><Select label="Кому разрешить вмешательство" value={player} onChange={setPlayer} options={people(v, false)} /><div class="m-btns"><Button small disabled={!id || !player} onClick={() => ask({ title: 'Разрешить вмешательство?', text: 'Этот герой сможет воздействовать на выбранную часть, даже если вы не положили её в круг.', okLabel: 'Разрешить', onOk: () => void run({ type: 'hidden17.ritual.permission', itemId: id, player, allow: true }) })}>Разрешить</Button><Button small kind="sec" disabled={!id || !player} onClick={() => void run({ type: 'hidden17.ritual.permission', itemId: id, player, allow: false })}>Отозвать доступ</Button></div>{id && <p class="m-note"><ItemText>Разрешено: {(v.hidden17!.ritual.permissions[id] ?? []).map(k => roleName(k, v)).join(', ') || 'никому'}</ItemText></p>}</details>;
}
