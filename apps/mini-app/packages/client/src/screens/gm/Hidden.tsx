import { ItemText } from '../../components/ItemText';
import { GmNarrativeGoals } from './Narrative';
import { useState } from 'preact/hooks';
import type { GmView, HiddenDice, HiddenMethod, HiddenUse } from '@fair/shared';
import { itemImageUrl } from '../../assets';
import { Button } from '../../components/Button';
import { Portrait } from '../../components/Portrait';
import { Select } from '../../components/Select';
import { Stepper } from '../../components/Stepper';
import { ask, loadedContent, run, gmTab } from '../../store';
import { countsText } from '../../labels';
import { ORDERS, SPECIAL_NAMES, STEPS } from '../HiddenCommon';
import { Outcome } from '../Ritual';
import { StoryText } from '../Story';

const who = (k: string) => loadedContent().roles.find(r => r.key === k)?.name ?? k;
const roleOptions = (v: GmView) => v.state.roster.map(k => ({ value: k, label: who(k), avatar: k }));
export function GmRitual({ v }: { v: GmView }) {
  const h = v.state.hidden17!; const r = h.ritual; const data = loadedContent().hidden17!;
  const idx = { preparation: 0, assembly: 0, powder: 2, choices: 2, responses: 3, 'last-choice': 4, finished: 4 }[r.step];
  const originalScene = data.ritual.steps[idx];
  const narrate = (text: string) => text.replaceAll('с плиты', 'из изученной записи').replaceAll('с надписи', 'из изученной записи').replaceAll('кто видит плиту', 'кто узнал способ');
  const scene = h.narrative && originalScene ? { ...originalScene, gm: narrate(originalScene.gm), players: originalScene.players.map(narrate), gmAction: idx === 0 ? 'Убедитесь, что участники узнали способ из личного источника или осмотра. Само присутствие у руин знания не даёт. Начните общую сцену, когда они договорятся попробовать обряд.' : narrate(originalScene.gmAction), roleNote: narrate(originalScene.roleNote) } : originalScene;
  const signs = Object.values(r.choices).filter(c => c.kind === 'sign' && c.status === 'active' && v.state.players[c.controller!]?.present);
  const single = new Set(signs.map(c => c.controller)).size === 1;
  const orders = [...new Set(signs.map(c => c.order!))];
  const at = (id: string) => { const it = v.state.items[id]; return it ? it.kind === 'shard' ? `Осколок ${it.ref}` : SPECIAL_NAMES[it.ref] ?? it.ref : 'расходованный предмет'; };
  return <>
    <h2 class="scr-h">Финал у могилы <small>{STEPS[r.step]}</small></h2>
    <div class="ritual-progress" aria-label="Этапы финала">{['Сборка', 'Пыль', 'Формула', 'Ответ', 'Выбор'].map((s, i) => <span class={i === idx ? 'on' : ''} key={s}>{i + 1}<small>{s}</small></span>)}</div>
    {h.narrative && r.step === 'preparation' && <div class="m-card"><h5>Открытие места</h5><p class="text"><ItemText>Незнающие видят старую заставу. Рецепт не висит на стене: его хранят Вельда и Астра. Туман, Лира и Мирон знают место. Передавайте сведения после разговора, показанного документа или осмотра по заявке; не проверяйте историю наизусть.</ItemText></p></div>}
    <div class="m-card"><h5>Место</h5><p class="text"><ItemText>{data.ritual.place}</ItemText></p></div>
    {scene && <div class="ritual-scene"><div class="m-card"><h5>Прочитать вслух</h5><blockquote><ItemText>{scene.gm}</ItemText></blockquote></div><div class="m-card"><h5>Действия игроков</h5><ol class="list">{scene.players.map(s => <li key={s}><ItemText>{s}</ItemText></li>)}</ol><div class="ritual-props">{scene.items.map(([ref, label]) => <span key={ref}><img src={itemImageUrl({ kind: ref === 'shard' ? 'shard' : 'potion', ref })} alt="" />{label}</span>)}</div><div class="ritual-cast">{scene.roles.map(k => <span key={k}><Portrait roleKey={k} emoji="☉" size="sm" />{who(k)}</span>)}</div><p class="m-note"><ItemText>{scene.roleNote}</ItemText></p></div><div class="m-card"><h5>Что проверяет ведущий</h5><p class="text"><ItemText>{scene.gmAction}</ItemText></p></div></div>}
    {r.step === 'last-choice' && single && orders.length > 1 && <div class="m-card"><h5>Выбрать одно записанное распоряжение</h5><p class="text"><ItemText>Управляющий: {who(signs[0].controller!)}. Уточните его выбор; новое распоряжение придумать сейчас нельзя.</ItemText></p>{orders.map(order => <Button key={order} kind={r.orderSelected === order ? 'main' : 'sec'} onClick={() => void run({ type: 'hidden17.ritual.order', order })}>{ORDERS.find(o => o.value === order)?.label}</Button>)}</div>}
    <div class="m-card hot"><h5>Провести шаг</h5>
      {r.step === 'preparation' && <><p class="text"><ItemText>Позовите игроков к могиле. Завершите начатые партии в кости; обычные сделки и заказы будут закрыты, резервы возвращены. Начинается только подготовленный финал.</ItemText></p><Button disabled={v.state.phase !== 'act3'} onClick={() => ask({ title: 'Начать финальную сцену?', text: 'Обмены, обычные применения и изготовление закончатся. Игроки смогут добровольно положить части и Фокусы в круг.', okLabel: 'Собрать у могилы', onOk: () => void run({ type: 'hidden17.ritual.start' }) })}>1 · Начать сборку</Button></>}
      {r.step === 'assembly' && <><p class="text"><ItemText>В круге {r.circle.length} частей: {r.circle.map(at).join(', ') || 'пусто'}. Фокусов: {r.focuses.length}.</ItemText></p><p class="m-note"><ItemText>При нехватке дайте одну двухминутную попытку договориться. Если не получилось, завершите сном без расхода.</ItemText></p><Button disabled={r.circle.length < 3 || r.focuses.length < 2} onClick={() => ask({ title: 'Рассыпать пыль?', text: `${data.ritual.steps[1]?.gm ?? ''} Два Фокуса будут израсходованы.`, okLabel: '2 · Первый удар', onOk: () => void run({ type: 'hidden17.ritual.powder' }) })}>2 · Рассыпать пыль</Button><Button kind="sec" onClick={() => ask({ title: 'Попытка договориться закончилась?', text: 'Сердце уснёт без расхода Фокусов.', okLabel: 'Завершить сном', onOk: () => void run({ type: 'hidden17.ritual.finish' }) })}>Недостаточно частей — сон</Button></>}
      {r.step === 'powder' && <><blockquote><ItemText>{data.ritual.formula}</ItemText></blockquote><p class="text"><ItemText>Знающий способ игрок читает формулу из записи вслух и подтверждает в приложении. Если никто не произнёс её — сон; пыль уже потрачена.</ItemText></p><Button kind="sec" onClick={() => ask({ title: 'Все отказались от формулы?', text: 'Обряд закончится сном; два Фокуса не возвращаются.', okLabel: 'Завершить сном', onOk: () => void run({ type: 'hidden17.ritual.finish' }) })}>Формула не произнесена</Button></>}
      {r.step === 'choices' && <><p class="text"><ItemText>Выбор прислали {Object.keys(r.choices).length} участников. Остальные поддерживают обряд. Дайте время поправить ошибочную заявку до раскрытия чужих действий.</ItemText></p><Button onClick={() => ask({ title: 'Раскрыть вмешательства?', text: 'Сначала сработают отзывы частей, затем проверятся доступность целей и подготовленные предметы. Станут видны только наблюдаемые действия.', okLabel: '4 · Раскрыть', onOk: () => void run({ type: 'hidden17.ritual.reveal' }) })}>4 · Раскрыть выбор</Button></>}
      {r.step === 'responses' && <><p class="text"><ItemText>Дайте две минуты на отказ от вмешательства и ответы талисманами. Не торопите: скорость нажатия не решает исход.</ItemText></p><Button onClick={() => ask({ title: 'Окно ответов завершено?', text: 'Применятся одновременно все неостановленные эффекты. Новые вмешательства станут недоступны.', okLabel: 'Применить эффекты', onOk: () => void run({ type: 'hidden17.ritual.resolve' }) })}>Применить ответы и эффекты</Button></>}
      {r.step === 'last-choice' && <><p class="text"><ItemText>Погашено уникальных частей: {r.extinguished.length}. Целых частей в круге: {r.circle.filter(id => !r.extinguished.includes(v.state.items[id]?.ref)).length}. Дайте две минуты на окончательное добавление или отзыв своих частей.</ItemText></p><Button onClick={() => ask({ title: 'Последний выбор сделан?', text: 'Жизнь, свобода и сила будут рассчитаны отдельно. После этого Сарн может впервые заговорить.', okLabel: '5 · Последний удар', onOk: () => void run({ type: 'hidden17.ritual.finish' }) })}>5 · Завершить ритуал</Button></>}
      {r.step === 'finished' && <Button onClick={() => { gmTab.value = 'results'; }}>К эпилогу и достижениям</Button>}
    </div>
    {r.step !== 'preparation' && <div class="m-card"><h5>Журнал обряда · только ведущему</h5>{Object.values(r.choices).map(c => <p class="text" key={c.player}><ItemText>{who(c.player)}: {SPECIAL_NAMES[c.kind] ?? (c.kind === 'pass' ? 'поддержка' : 'отзыв')} {c.targetId && `→ ${at(c.targetId)}`} {c.controller && ` · ${who(c.controller)} · ${ORDERS.find(o => o.value === c.order)?.label}`} <small>({c.status})</small></ItemText></p>)}{r.observed.map((s, i) => <p class="m-note" key={i}><ItemText>{s}</ItemText></p>)}</div>}
    <Knowledge v={v} />
  </>;
}
function Knowledge({ v }: { v: GmView }) {
  const [player, setPlayer] = useState(''); const [method, setMethod] = useState<HiddenMethod>('salt');
  return <details class="m-card"><summary>Передача знаний и подтверждённые сцены</summary>
    <div class="field"><span>Кто узнал способ в игре</span><Select label="Получатель знания" value={player} onChange={setPlayer} options={roleOptions(v)} /></div><div class="field"><span>Переданный способ</span><Select label="Переданный способ" value={method} onChange={s => setMethod(s as HiddenMethod)} options={(['salt', 'sign', 'vessel'] as const).map(m => ({ value: m, label: SPECIAL_NAMES[m] }))} /></div><Button small disabled={!player || v.state.hidden17!.ritual.step !== 'preparation'} onClick={() => void run({ type: 'hidden17.learn', player, method })}>Подтвердить обучение</Button>
    <p class="m-note"><ItemText>Отмечайте только состоявшиеся сцены. Для правды разные владельцы могут одновременно предъявить A, B и C; собирать всё в одной сумке не нужно.</ItemText></p>
    {!v.state.hidden17?.narrative && ([['truth', loadedContent().hidden17!.roles.o11.goals[1]], ['serafinaOffer', loadedContent().hidden17!.roles.o1.goals[1]], ['veldaRenounced', loadedContent().hidden17!.roles.o5.goals[1]]] as const).map(([fact, text]) => <label class="check hidden-check" key={fact}><input type="checkbox" checked={v.state.hidden17!.facts[fact]} onChange={e => void run({ type: 'hidden17.fact', fact, value: e.currentTarget.checked })} />{text}</label>)}
  </details>;
}
export function GmHiddenResults({ v }: { v: GmView }) {
  const h = v.state.hidden17!; const o = h.ritual.outcome;
  if (!o) return <><GmNarrativeGoals v={v}/><div class="m-card"><h5>Финал ещё не завершён</h5><p class="text"><ItemText>Итог определяется у могилы: сначала части, пыль, формула, затем раскрытие вмешательств и последний выбор.</ItemText></p><Button onClick={() => { gmTab.value = 'ritual'; }}>Перейти к финалу</Button><Knowledge v={v} /></div></>;
  return <><h2 class="scr-h">Эпилог</h2><Outcome outcome={o} name={who} /><div class="m-card"><h5>Сарн говорит после возвращения</h5><p class="text"><ItemText>{o.life === 'awake' ? 'Теперь сыграйте ответ Сарна. Учитывайте действующее распоряжение. Он может принять конечную, добровольную услугу и совершить одно большое добровольное чудо за вечер. Просители согласуют одну просьбу за две минуты; без согласия чуда нет.' : 'Сарн не вернулся и не может отвечать. Расскажите, что осталось у могилы, затем дайте каждому короткий личный эпилог.'}</ItemText></p><p class="m-note"><ItemText>Решения и новые последствия можно записать на вкладке «Сюжет». Чудо не даёт вечного подчинения, чужого имущества или контроля над игроками.</ItemText></p></div>
    <Knowledge v={v} />
    <div class="m-card"><h5>Личные достижения</h5>{h.narrative ? <GmNarrativeGoals v={v}/> : v.state.roster.map(k => <div class="gm-hidden-goals" key={k}><div class="item"><Portrait roleKey={k} emoji="☉" size="sm" /><b>{who(k)}</b></div>{loadedContent().hidden17!.roles[k]?.goals.map((t, i) => <p class={o.goals[k]?.[i] ? 'text goal-done' : 'text'} key={i}><ItemText>{o.goals[k]?.[i] ? '✓' : '○'} {t}</ItemText></p>)}</div>)}</div>
    {v.state.phase === 'act3' && <Button onClick={() => ask({ title: 'Зафиксировать итоги ярмарки?', text: 'Достижения будут сохранены. Затем их можно показать игрокам.', okLabel: 'Закрыть ярмарку', onOk: () => void run({ type: 'session.close' }) })}>Зафиксировать итоги</Button>}
    {v.state.phase === 'closed' && <Button onClick={() => void run({ type: 'session.reveal' })}>Показать игрокам их итоги</Button>}
    {v.state.phase === 'revealed' && <p class="m-note"><ItemText>Игрокам показаны общий исход и только их собственные достижения.</ItemText></p>}
  </>;
}
export function GmTavern({ v }: { v: GmView }) {
  const h = v.state.hidden17!;
  return <details class="m-card" open><summary>{h.narrative ? 'Осмотры вещей' : 'Таверна · заказы и кости'}</summary>
    {Object.values(h.board).filter(p => p.status === 'open' || p.status === 'accepted').map(p => <div class="gm-board" key={p.id}><h4>{p.title}</h4><p class="text"><ItemText>{who(p.author)}{p.worker && ` → ${who(p.worker)}`}: {p.condition}</ItemText></p><p class="m-note"><ItemText>Проверка: {p.verification}</ItemText></p><p class="m-note"><ItemText>Награда: {countsText(p.reward)} {p.reward.items.map(id => { const i = v.state.items[id]; return i ? SPECIAL_NAMES[i.ref] ?? i.ref : id; }).join(', ')} {p.service}</ItemText></p>
      <div class="m-btns"><Button small disabled={p.status !== 'accepted'} onClick={() => ask({ title: 'Условие выполнено?', text: 'Материальная награда будет выдана исполнителю. Если обещана услуга, подтвердите её фактическое выполнение и согласие участников.', okLabel: 'Подтвердить и выдать', onOk: () => void run({ type: 'hidden17.board.complete', id: p.id }) })}>Подтвердить выполнение</Button><Button small kind="sec" onClick={() => ask({ title: 'Отменить по решению ведущего?', text: 'Зарезервированная награда вернётся автору.', okLabel: 'Отменить', onOk: () => void run({ type: 'hidden17.board.cancel', id: p.id }) })}>Разрешить спор / отменить</Button></div>
    </div>)}
    {!h.narrative && !Object.values(h.board).some(p => p.status === 'open' || p.status === 'accepted') && <p class="m-note"><ItemText>Активных заказов нет.</ItemText></p>}
    {Object.values(h.dice).filter(d => d.status === 'accepted' || d.status === 'started').map(d => <GmDice key={d.id} d={d} />)}
    {Object.values(h.uses).filter(u => u.status === 'pending' && u.question).map(u => <GmLens key={u.id} u={u} v={v} />)}
  </details>;
}
function GmDice({ d }: { d: HiddenDice }) {
  const [a, setA] = useState(1); const [b, setB] = useState(1);
  return <div class="gm-board"><h5>Кости: {who(d.from)} · {who(d.to)}</h5><p class="m-note"><ItemText>{d.stake ? 'По 1 золотому' : 'Без ставки'}. Числа берите с настоящих кубиков.</ItemText></p>{d.status === 'accepted' ? <Button small onClick={() => ask({ title: 'Начать броски?', text: 'Оба согласились. После начала нельзя отменить партию.', okLabel: 'Бросайте', onOk: () => void run({ type: 'hidden17.dice.start', id: d.id }) })}>Разрешить броски</Button> : <><div class="m-row"><span>{who(d.from)}</span><Stepper label={`Бросок: ${who(d.from)}`} min={1} max={6} value={a} onChange={setA} /></div><div class="m-row"><span>{who(d.to)}</span><Stepper label={`Бросок: ${who(d.to)}`} min={1} max={6} value={b} onChange={setB} /></div><Button small onClick={() => ask({ title: `Записать ${a} : ${b}?`, text: 'Подтвердите выпавшие значения с обоими игроками. Банк будет распределён автоматически.', okLabel: 'Записать результат', onOk: () => void run({ type: 'hidden17.dice.resolve', id: d.id, rolls: [a, b] }) })}>Зафиксировать броски</Button></>}</div>;
}
function GmLens({ u, v }: { u: HiddenUse; v: GmView }) {
  const [answer, setAnswer] = useState(''); const it = u.relicId ? v.state.items[u.relicId] : null;
  return <div class="gm-board"><h5>Осмотровая линза: {who(u.author)}</h5><p class="text"><ItemText>{it?.ref} · {u.question === 'material' ? 'Из какого материала?' : 'Есть ли скрытое отделение?'}</ItemText></p><p class="m-note"><ItemText>{loadedContent().hidden17?.signatureGoods.find(g => g.id === 'inspection-lens')?.gmNote} Нужны согласия: {u.targets.map(who).join(', ')}.</ItemText></p><StoryText label="Физическое наблюдение" value={answer} onChange={setAnswer} max={1000} /><Button small disabled={!answer.trim() || !u.targets.every(k => u.approved.includes(k))} onClick={() => void run({ type: 'hidden17.signature.resolve', id: u.id, answer })}>Сообщить результат осмотра</Button></div>;
}
