import { AbilityArt } from '../components/AbilityIdentity';
import { useState } from 'preact/hooks';
import type { Bundle, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { Portrait } from '../components/Portrait';
import { Select } from '../components/Select';
import { Stepper } from '../components/Stepper';
import { INGREDIENTS, emptyBundle, roleName } from '../labels';
import { ask, now, run, showToast } from '../store';
import { Events } from './Events';
import { StoryText } from './Story';
import { HiddenItem, Reward, people } from './HiddenCommon';

const STATUS = { open: 'Открыт', accepted: 'Исполнитель найден', completed: 'Награда выдана', cancelled: 'Отменён', expired: 'Срок истёк' };
export function Tavern({ v }: { v: PlayerView }) {
  const h = v.hidden17!;
  const me = v.me.role.key;
  const [panel, setPanel] = useState<'board' | 'dice' | 'events'>('board');
  const [compose, setCompose] = useState(false);
  const [rumor, setRumor] = useState('');
  return <>
    <h2 class="scr-h">Таверна <small>заказы, слухи, разговоры</small></h2>
    <div class="hidden-switch" role="group" aria-label="Залы таверны">{([['board', 'Доска'], ['dice', 'Кости'], ['events', 'Заявки и события']] as const).map(([key, label]) => <button class={panel === key ? 'on' : ''} onClick={() => setPanel(key)}>{label}</button>)}</div>
    {panel === 'events' ? <Events v={v} /> : panel === 'dice' ? <Dice v={v} /> : <>
      <div class="m-card"><h5>Доска объявлений</h5><p class="text">Попросите достать вещь, оказать услугу или помочь в сцене. Напишите точное условие и награду — ведущий подтвердит выполнение.</p><p class="m-note">Материальная награда резервируется. После принятия отмена требует согласия обоих участников или решения ведущего.</p><Button kind="sec" onClick={() => setCompose(!compose)}>{compose ? 'Свернуть' : 'Разместить объявление'}</Button></div>
      {compose && <BoardForm v={v} done={() => setCompose(false)} />}
      <details class="m-card"><summary>Слухи и переговоры</summary><p class="m-note">Слух — слова персонажа, а не подтверждение ведущего. Не публикуйте сведения, которые хотите оставить личными.</p><StoryText label="Ваш слух или приглашение к разговору" value={rumor} onChange={setRumor} max={1000} /><Button disabled={!rumor.trim()} onClick={async () => { const result = await run({ type: 'hidden17.rumor', text: rumor }); if (result.ok) setRumor(''); }}>Объявить в таверне</Button>{[...h.rumors].reverse().map((r, i) => <p class="text" key={i}><b>{roleName(r.author, v)} · непроверенный слух:</b> {r.text}</p>)}</details>
      {!h.board.length && <p class="m-note">Доска пока пуста. Первый заказ можете разместить вы.</p>}
      {[...h.board].reverse().map(p => <article class="m-card board-post" key={p.id}>
        <div class="item"><Portrait roleKey={p.author} emoji="☉" size="sm" /><div class="item-text"><b>{p.title}</b><span>{roleName(p.author, v)} · {STATUS[p.status]}</span></div></div>
        <p class="text">{p.condition}</p><p class="m-note"><b>Проверка:</b> {p.verification}</p>
        <Reward reward={p.reward} service={p.service} v={v} />
        <p class="m-note">До {new Date(p.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}{p.worker ? ` · выполняет ${roleName(p.worker, v)}` : ''}</p>
        {p.status === 'open' && p.author !== me && <Button small onClick={() => ask({ title: 'Взяться за заказ?', text: p.condition, okLabel: 'Принять', onOk: () => void run({ type: 'hidden17.board.accept', id: p.id }) })}>Взяться за заказ</Button>}
        {['open', 'accepted'].includes(p.status) && (p.author === me || p.worker === me) && <Button small kind="sec" disabled={p.cancelApproved.includes(me)} onClick={() => ask({ title: 'Отменить заказ?', text: p.status === 'accepted' ? 'Отмена произойдёт после согласия второго участника. Спор решает ведущий.' : 'Награда вернётся в свободный запас.', okLabel: 'Подтвердить отмену', onOk: () => void run({ type: 'hidden17.board.cancel', id: p.id }) })}>{p.cancelApproved.includes(me) ? 'Ждём согласия на отмену' : p.cancelApproved.length ? 'Согласиться на отмену' : 'Отменить заказ'}</Button>}
        {p.status === 'accepted' && <p class="m-note">Когда условие выполнено, позовите ведущего для проверки и выдачи награды.</p>}
      </article>)}
    </>}
  </>;
}
function BoardForm({ v, done }: { v: PlayerView; done: () => void }) {
  const [title, setTitle] = useState(''); const [condition, setCondition] = useState('');
  const [verification, setVerification] = useState('Ведущий подтверждает выполнение в общей сцене.');
  const [service, setService] = useState(''); const [serviceAbility, setServiceAbility] = useState(false); const [reward, setReward] = useState<Bundle>(emptyBundle());
  const [minutes, setMinutes] = useState(30); const [busy, setBusy] = useState(false);
  const free = v.me.available;
  const submit = async () => {
    setBusy(true);
    try { const r = await run({ type: 'hidden17.board.create', title, condition, verification, reward, ...(service.trim() ? { service: service.trim(), serviceAbility } : {}), expiresAt: now.value + minutes * 60000 }); if (r.ok) { showToast('Объявление размещено'); done(); } } finally { setBusy(false); }
  };
  return <div class="m-card board-form"><h5>Новый заказ</h5>
    <StoryText label="Заголовок" value={title} onChange={setTitle} max={120} small />
    <StoryText label="Что нужно сделать" value={condition} onChange={setCondition} max={1000} />
    <StoryText label="Как проверить выполнение" value={verification} onChange={setVerification} max={500} />
    <h5>Что вы обещаете</h5>
    <div class="m-row"><span>Золото</span><Stepper label="Награда золотом" value={reward.gold} min={0} max={free.gold} onChange={gold => setReward({ ...reward, gold })} /></div>
    {INGREDIENTS.map(i => <div class="m-row" key={i.key}><span>{i.name}</span><Stepper label={`Награда: ${i.name}`} value={reward.ingredients[i.key]} min={0} max={free.ingredients[i.key]} onChange={n => setReward({ ...reward, ingredients: { ...reward.ingredients, [i.key]: n } })} /></div>)}
    {v.me.items.filter(i => free.items.includes(i.id)).map(i => <label class="check hidden-check" key={i.id}><input type="checkbox" checked={reward.items.includes(i.id)} onChange={e => setReward({ ...reward, items: e.currentTarget.checked ? [...reward.items, i.id] : reward.items.filter(id => id !== i.id) })} /><HiddenItem item={i} v={v} /></label>)}
    <StoryText label="Ваша услуга в награду (необязательно)" value={service} onChange={setService} max={500} />
    {['cleanseOther', 'discountOther', 'protectOther'].includes(v.me.ability.kind) && <label class="check hidden-check"><input type="checkbox" checked={serviceAbility} onChange={e => setServiceAbility(e.currentTarget.checked)} /><span class="ability-inline"><AbilityArt roleKey={v.me.role.key} small/><span>Награда — моя обычная способность «{v.me.ability.name}»</span></span></label>}
    {serviceAbility && <p class="m-note">Применение будет обещано исполнителю. Использовать его для другого человека до завершения или отмены заказа нельзя. Перед выдачей награды примените способность к исполнителю с его согласия.</p>}
    <p class="m-note">Укажите действие, срок и ограничения. Обещать действие другого героя нельзя. Услугу подтверждает ведущий; она требует согласия участников.</p>
    <div class="m-row"><span>Срок, минут</span><Stepper label="Срок заказа" value={minutes} min={1} max={180} onChange={setMinutes} /></div>
    <Button disabled={busy || !title.trim() || !condition.trim() || !verification.trim() || (serviceAbility && !service.trim()) || !(reward.gold || reward.items.length || Object.values(reward.ingredients).some(Boolean) || service.trim())} onClick={() => ask({ title: 'Разместить заказ?', text: 'Обещанные вещи, ингредиенты и золото будут зарезервированы.', okLabel: 'Разместить', onOk: () => void submit() })}>Разместить с наградой</Button>
  </div>;
}
function Dice({ v }: { v: PlayerView }) {
  const [to, setTo] = useState(''); const [stake, setStake] = useState<0 | 1>(1);
  const status = { pending: 'Приглашение', accepted: 'Оба согласились', started: 'Броски начались', completed: 'Завершено', cancelled: 'Отменено' };
  return <>
    <div class="m-card"><h5>Настоящие кости</h5><p class="text">Возьмите по одному кубику d6. Каждый ставит один золотой или оба играют без ставки. Больший результат забирает банк; при равенстве каждому возвращается его монета.</p><p class="m-note">Сначала договоритесь, затем ведущий открывает броски и записывает выпавшие числа. После первого броска отменить игру нельзя. Способности на кости не действуют.</p>
      <div class="field"><span>С кем играть</span><Select label="Соперник в кости" value={to} onChange={setTo} options={people(v, false)} /></div>
      <label class="check"><input type="checkbox" checked={stake === 1} onChange={e => setStake(e.currentTarget.checked ? 1 : 0)} />По одному золотому</label>
      <Button disabled={!to || v.me.available.gold < stake} onClick={() => void run({ type: 'hidden17.dice.invite', to, stake })}>Предложить сыграть</Button>
    </div>
    {v.hidden17!.dice.map(d => <div class="m-card" key={d.id}><h5>{roleName(d.from, v)} · {roleName(d.to, v)}</h5><p class="text">{status[d.status]} · {d.stake ? 'по 1 золотому' : 'без ставки'}</p>{d.rolls && <p class="dice-result">{d.rolls[0]} : {d.rolls[1]}<small>{d.rolls[0] === d.rolls[1] ? 'Ничья' : `Победа: ${roleName(d.rolls[0] > d.rolls[1] ? d.from : d.to, v)}`}</small></p>}
      {d.status === 'pending' && d.to === v.me.role.key && <Button small onClick={() => void run({ type: 'hidden17.dice.accept', id: d.id })}>Согласиться</Button>}
      {['pending', 'accepted'].includes(d.status) && <Button small kind="sec" onClick={() => void run({ type: 'hidden17.dice.cancel', id: d.id })}>Отменить до броска</Button>}
    </div>)}
  </>;
}
