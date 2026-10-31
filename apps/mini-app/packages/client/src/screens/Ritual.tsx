import { BASE } from '../base';
import { navigateTab } from '../narrative-navigation';
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
  const offer = (it: Item, include: boolean) => ask({ title: `${include ? 'Положить в круг' : 'Отозвать'}: ${name(it.id)}?`, text: include ? 'Вещь остаётся вашей. Фокусы будут потрачены при рассыпании пыли, осколок участвует в общем риске.' : 'Вы отзываетe только свою вещь.', okLabel: include ? 'Положить' : 'Отозвать', onOk: () => void run({ type: 'hidden17.ritual.offer', itemId: it.id, include }) });
  return <>
    {h.narrative ? <><header class="narrative-scene"><img src={`${BASE}assets/scenes/outpost.webp`} alt="Старая каменная застава у реки"/><div><span class="narrative-eyebrow">За краем ярмарки</span><h2>Старая застава</h2></div></header>{r.step === 'preparation' && <div class="m-card"><h5>{h.narrative.knowledge.includes('place') ? 'Место гибели Сарна' : 'У обвалившейся стены'}</h5><p class="text">Между корнями лежит тяжёлая каменная плита. Ветер с реки едва слышен за стеной. Здесь давно никто не живёт.</p><p class="m-note">{h.narrative.knowledge.includes('joining') ? 'Из ваших свидетельств известно, как попытаться вернуть Сарна. Найдите союзников и принесите сюда необходимое. Успех никто не обещал.' : h.narrative.knowledge.includes('place') ? 'Вам известно, чьи останки покоятся здесь. Но само место не объясняет, что с ними можно сделать.' : 'Чужие рассказы, найденные свидетельства и ваш собственный осмотр могут открыть историю этого места.'}</p><button class="narrative-back" onClick={() => navigateTab('events')}>Предложить ведущему свой осмотр или действие →</button></div>}</> : <h2 class="scr-h">Могила Сарна <small>{STEPS[r.step]}</small></h2>}
    {!h.narrative && <div class="m-card ritual-stone"><h5>Надпись у обвалившейся стены</h5><ol class="list">{r.stone.map(s => <li key={s}>{s}</li>)}</ol><p class="m-note">Инструкция доступна каждому у могилы. Знать историю Сарна наизусть не требуется.</p></div>}
    {r.step === 'preparation' && <Preparation v={v} />}
    {r.step !== 'preparation' && r.step !== 'finished' && <div class="m-card"><h5>Ритуал начался</h5><p class="text">Обычные сделки, изготовление и способности завершены. Теперь действуют только шаги обряда и заранее подготовленные вещи.</p></div>}
    {['assembly', 'powder', 'choices', 'responses', 'last-choice'].includes(r.step) && <div class="m-card"><h5>В круге</h5><div class="ritual-slots">{['I', 'II', 'III', 'IV', 'V'].map(ref => {
      const id = r.circle.find(id => h.knownItems[id]?.ref === ref || v.me.items.find(i => i.id === id)?.ref === ref);
      const broken = r.extinguished.includes(ref);
      return <div class={`ritual-slot ${id ? 'filled' : ''} ${broken ? 'broken' : ''}`} key={ref}><span>{ref}</span>{id && <img src={itemImageUrl({ kind: 'shard', ref })} alt={`Осколок ${ref}`} />}<small>{broken ? 'погашен' : id ? 'в круге' : 'нет в круге'}</small></div>;
    })}</div><p class="m-note">{r.step === 'assembly' ? `Фокусов предложено: ${r.focuses.length} из 2.` : 'Два Фокуса израсходованы на пыль.'} Владельцы неоткрытых частей здесь не раскрываются.</p></div>}
    {['assembly', 'last-choice'].includes(r.step) && <div class="m-card"><h5>Ваши части {r.step === 'assembly' && 'и Фокусы'}</h5>
      {owned.filter(i => r.step === 'assembly' || i.kind === 'shard').map(it => { const included = r.circle.includes(it.id) || r.focuses.includes(it.id); return <ItemCard key={it.id} title={name(it.id)} emoji="✦" img={itemImageUrl(it)} sub={r.extinguished.includes(it.ref) ? 'погашен' : included ? 'вы положили в круг' : 'у вас'}><Button small disabled={r.extinguished.includes(it.ref) || (!included && !available.some(a => a.id === it.id))} onClick={() => offer(it, !included)}>{included ? 'Отозвать' : 'Положить'}</Button></ItemCard>; })}
      {!owned.length && <p class="m-note">У вас нет подходящих вещей. Вы можете договариваться, наблюдать и поддерживать обряд.</p>}
    </div>}
    {r.step === 'powder' && !!r.formula && <div class="m-card"><h5>Произнесите у могилы</h5><blockquote>{r.formula}</blockquote><p class="m-note">Произнесите слова из известного вам источника вслух, затем подтвердите действие.</p><Button onClick={() => void run({ type: 'hidden17.ritual.formula', text: r.formula })}>Формула произнесена</Button></div>}
    {!h.narrative && ['preparation', 'assembly', 'powder', 'choices'].includes(r.step) && v.me.items.some(i => i.kind === 'shard') && <ShardPermission v={v} />}
    {r.step === 'choices' && <Choice v={v} />}
    {r.step === 'last-choice' && r.orderOptions.length > 1 && <div class="m-card"><h5>Один из ваших записанных приказов</h5><p class="text">На знаках несколько распоряжений с вашим именем. Выберите одно, которое вступит в силу при возвращении.</p>{r.orderOptions.map(order => <Button key={order} kind={r.orderSelected === order ? 'main' : 'sec'} onClick={() => void run({ type: 'hidden17.ritual.order', order })}>{ORDERS.find(o => o.value === order)?.label}</Button>)}</div>}
    {r.step === 'responses' && <Responses v={v} />}
    {r.observed.length > 0 && <div class="m-card"><h5>Что произошло у могилы</h5><ol class="list">{r.observed.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}
    {r.outcome && <Outcome outcome={r.outcome} name={k => roleName(k, v)} />}
  </>;
}
function Preparation({ v }: { v: PlayerView }) {
  const h = v.hidden17!;
  const [method, setMethod] = useState<HiddenMethod>(h.knownMethods[0] ?? 'salt');
  const [itemId, setItem] = useState(''); const [order, setOrder] = useState<HiddenOrder>('leave');
  const [controller, setController] = useState(v.me.role.key);
  const source = v.me.items.filter(i => v.me.available.items.includes(i.id) && i.kind === (method === 'sign' ? 'focus' : 'potion'));
  const selected = source.some(i => i.id === itemId) ? itemId : source[0]?.id ?? '';
  return <>
    {!h.narrative && <div class="m-card"><h5>До первого удара</h5><p class="text">{h.ritual.stone.slice(1, 3).join(' ')}</p></div>}
    {h.methods.map(m => <details class="m-card secret-method" key={m.id}><summary>{m.title} · ваше знание</summary><p class="text">{m.private}</p><p class="text"><b>Цена:</b> {m.cost}</p><p class="m-note">{m.tell}</p><p class="m-note">{m.counter}</p><p class="text">{m.result}</p></details>)}
    {h.knownMethods.length > 0 && <div class="m-card"><h5>Тайная подготовка</h5><div class="field"><span>Известный вам способ</span><Select label="Способ подготовки" value={method} onChange={s => { setMethod(s as HiddenMethod); setItem(''); }} options={h.knownMethods.map(m => ({ value: m, label: SPECIAL_NAMES[m] }))} /></div>
      <div class="field"><span>Потратить готовое изделие</span><Select label="Сырьё для подготовки" value={selected} onChange={setItem} placeholder="Сначала изготовьте или приобретите изделие" options={source.map(i => ({ value: i.id, label: specialLabel(i, v), image: itemImageUrl(i) }))} /></div>
      {method === 'sign' && <><div class="field"><span>Имя управляющего</span><Select label="Управляющий знаком" value={controller} onChange={setController} options={people(v)} /></div><div class="field"><span>Одно распоряжение до рассвета</span><Select label="Заранее записанный приказ" value={order} onChange={s => setOrder(s as HiddenOrder)} options={ORDERS} /></div><p class="m-note">Имя и распоряжение записываются сейчас. В финале их нельзя подменить.</p></>}
      <Button disabled={!selected} onClick={() => ask({ title: `Подготовить: ${SPECIAL_NAMES[method]}?`, text: 'Выбранное изделие будет потрачено. Подготовленный предмет появится в сумке.', okLabel: 'Подготовить', onOk: () => void run({ type: 'hidden17.prepare', method, itemId: selected, ...(method === 'sign' ? { controller, order } : {}) }) })}>Подготовить предмет</Button>
    </div>}
    {(!h.narrative || v.me.items.some(i => !!h.prepared[i.id])) && <div class="m-card"><h5>Подготовленные вещи</h5>{v.me.items.filter(i => !!h.prepared[i.id]).map(i => <p key={i.id}><HiddenItem item={i} v={v} />{h.prepared[i.id].controller && <small class="m-note"> · {roleName(h.prepared[i.id].controller!, v)} · {ORDERS.find(o => o.value === h.prepared[i.id].order)?.label}</small>}</p>)}<p class="m-note">Если другой герой научил вас способу в игре, попросите ведущего подтвердить передачу знания.</p></div>}
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
  return <div class="m-card"><h5>Ваш скрытый выбор</h5><p class="text">Один выбор на участника. Остальные увидят действие только при раскрытии. Если ничего не отправить — вы поддерживаете обряд.</p>
    {r.myChoice && <p class="m-note">Записано: {r.myChoice.kind === 'pass' ? 'поддержать' : r.myChoice.kind === 'withdraw' ? 'отозвать части' : SPECIAL_NAMES[r.myChoice.kind]}.</p>}
    <Select label="Действие в ритуале" value={kind} onChange={s => { setKind(s as HiddenChoice['kind']); setItem(''); }} options={options} />
    {['salt', 'sign', 'vessel'].includes(kind) && <div class="field"><span>Предмет</span><Select label="Подготовленный предмет" value={id} onChange={setItem} options={items.map(i => ({ value: i.id, label: specialLabel(i, v) }))} /></div>}
    {kind === 'salt' && <div class="field"><span>Доступная часть</span><Select label="Цель соли" value={target} onChange={setTarget} options={salts.map(id => ({ value: id, label: `Осколок ${h.knownItems[id]?.ref ?? v.me.items.find(i => i.id === id)?.ref ?? '?'}`, image: itemImageUrl({ kind: 'shard', ref: '' }) }))} /></div>}
    {kind === 'withdraw' && own.map(i => <label class="check hidden-check" key={i.id}><input type="checkbox" checked={withdraw.includes(i.id)} onChange={e => setWithdraw(e.currentTarget.checked ? [...withdraw, i.id] : withdraw.filter(id => id !== i.id))} /><HiddenItem item={i} v={v} /></label>)}
    <Button disabled={!valid || !!r.myChoice} onClick={() => void run({ type: 'hidden17.ritual.choice', kind, ...(['salt', 'sign', 'vessel'].includes(kind) ? { itemId: id } : {}), ...(kind === 'salt' ? { targetId: target } : {}), ...(kind === 'withdraw' ? { shardIds: withdraw } : {}) })}>{r.myChoice ? 'Выбор запечатан' : 'Сохранить скрытый выбор'}</Button>
  </div>;
}
function Responses({ v }: { v: PlayerView }) {
  const h = v.hidden17!; const r = h.ritual;
  const wards = v.me.items.filter(i => i.kind === 'ward' && (v.me.available.items.includes(i.id) || i.reservedFor === 'hidden17:ward'));
  const [ward, setWard] = useState(''); const id = wards.some(w => w.id === ward) ? ward : wards[0]?.id ?? '';
  return <div class="m-card"><h5>Окно ответа · 2 минуты</h5><p class="text">Автор может отказаться от своего вмешательства: компонент останется потраченным. Каждый участник может потратить один свой неиспользованный талисман против одной попытки.</p>
    {r.myChoice?.status === 'active' && <Button kind="sec" onClick={() => ask({ title: 'Отменить своё вмешательство?', text: 'Компонент не вернётся. Выбрать новое действие нельзя.', okLabel: 'Отказаться', onOk: () => void run({ type: 'hidden17.ritual.cancel' }) })}>Отказаться от своего вмешательства</Button>}
    {wards.length > 0 && <div class="field"><span>Ваш талисман</span><Select label="Талисман для ответа" value={id} onChange={setWard} options={wards.map(w => ({ value: w.id, label: 'Защитный талисман', image: itemImageUrl(w) }))} /></div>}
    {r.interventions.map(c => <div class="ritual-attempt" key={c.player}><div class="item"><Portrait roleKey={c.player} emoji="☉" size="sm" /><div class="item-text"><b>{roleName(c.player, v)} · {SPECIAL_NAMES[c.kind] ?? 'отзыв'}</b><span>{c.targetId ? `Осколок ${h.knownItems[c.targetId]?.ref ?? '?'}` : c.controller ? `Имя на знаке: ${roleName(c.controller, v)}` : 'Подключение к кругу'}</span></div></div><p class="m-note">{c.status === 'active' ? 'Действует, если её не остановят' : c.status === 'cancelled' ? 'Автор отказался' : c.status === 'blocked' ? 'Остановлена талисманом' : 'Не действует'}</p>
      {c.status === 'active' && <Button small disabled={!id} onClick={() => ask({ title: 'Защитить от этой попытки?', text: 'Один талисман останавливает одну попытку. При нескольких щитах на одну цель тратится только один.', okLabel: 'Выбрать защиту', onOk: () => void run({ type: 'hidden17.ritual.ward', itemId: id, against: c.player }) })}>Остановить талисманом</Button>}
    </div>)}
    {!r.interventions.length && <p class="m-note">Вмешательств нет. Ведущий перейдёт к последнему выбору.</p>}
  </div>;
}
export function Outcome({ outcome: o, name }: { outcome: HiddenOutcome; name: (key: string) => string }) {
  return <div class="m-card outcome hidden-outcome"><h5>Что изменилось</h5><dl><dt>Жизнь</dt><dd>{o.life === 'awake' ? 'Сарн вернулся' : o.life === 'destroyed' ? 'Сердце уничтожено' : 'Сердце уснуло'}</dd><dt>Свобода</dt><dd>{o.life !== 'awake' ? 'Связь не возникла' : o.freedom === 'free' ? 'Сарн свободен' : `${name(o.controller!)}: ${ORDERS.find(x => x.value === o.order)?.label ?? 'одно ограниченное распоряжение'} до рассвета`}</dd><dt>Сила</dt><dd>{o.life !== 'awake' ? 'Сосуды пусты' : o.power === 'whole' ? 'Сила осталась у Сарна' : o.power === 'full' ? 'Один сосуд получил полную порцию' : o.power === 'weak' ? 'Сосуды получили слабые остатки' : 'Сосуды пусты'}</dd></dl><p class="m-note">Личные достижения оцениваются отдельно. Участники могут рассказать свои тайны в эпилоге по желанию.</p></div>;
}

function ShardPermission({ v }: { v: PlayerView }) {
  const [id, setId] = useState(''); const [player, setPlayer] = useState('');
  return <details class="m-card"><summary>Дать доступ к своей части вне круга</summary><p class="m-note">Это разрешение на ритуальное вмешательство конкретного участника. Передача собственности не происходит. Доступ можно отозвать до раскрытия.</p><Select label="Часть для разрешения" value={id} onChange={setId} options={v.me.items.filter(i => i.kind === 'shard').map(i => ({ value: i.id, label: specialLabel(i, v) }))} /><Select label="Кому разрешить вмешательство" value={player} onChange={setPlayer} options={people(v, false)} /><div class="m-btns"><Button small disabled={!id || !player} onClick={() => ask({ title: 'Разрешить вмешательство?', text: 'Этот герой сможет воздействовать на выбранную часть, даже если вы не положили её в круг.', okLabel: 'Разрешить', onOk: () => void run({ type: 'hidden17.ritual.permission', itemId: id, player, allow: true }) })}>Разрешить</Button><Button small kind="sec" disabled={!id || !player} onClick={() => void run({ type: 'hidden17.ritual.permission', itemId: id, player, allow: false })}>Отозвать доступ</Button></div>{id && <p class="m-note">Разрешено: {(v.hidden17!.ritual.permissions[id] ?? []).map(k => roleName(k, v)).join(', ') || 'никому'}</p>}</details>;
}
