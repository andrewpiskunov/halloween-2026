import { ItemText } from '../components/ItemText';
import { useState } from 'preact/hooks';
import type { Item, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { ask, run } from '../store';
import { roleName } from '../labels';
import { SPECIAL_NAMES, people, specialLabel } from './HiddenCommon';

export function SignatureGoods({ v, historyOnly = false }: { v: PlayerView; historyOnly?: boolean }) {
  const h = v.hidden17!;
  const items = v.me.items.filter(i => i.kind === 'special' && ['shape-fixative', 'inspection-lens', 'herbal-incense'].includes(i.ref));
  return <>
    {!historyOnly && items.map(i => <SignatureUse key={i.id} item={i} v={v} />)}
    {h.uses.map(u => <div class="m-card" key={u.id}><h5>{SPECIAL_NAMES[u.ref] ?? 'Особое изделие'}</h5><p class="text"><ItemText>{h.signatureGoods.find(g => g.id === u.ref)?.effect}</ItemText></p>{u.guise && <p class="text"><ItemText>Закрепляемый облик: {u.guise}</ItemText></p>}<p class="text"><ItemText>{roleName(u.author, v)} → {u.targets.map(k => roleName(k, v)).join(', ')}</ItemText></p><p class="m-note"><ItemText>{u.status === 'pending' ? 'Ждёт согласия' : u.status === 'completed' ? 'Применено' : 'Отменено'}{u.question ? ` · ${u.question === 'effect' ? 'назначение компонента' : u.question === 'material' ? 'материал реликвии' : 'скрытое отделение'}` : ''}{u.effects && Object.entries(u.effects).map(([k, e]) => ` · ${roleName(k, v)}: снять ${e === 'curse' ? 'проклятие' : 'шипы'}`).join('')}</ItemText></p>{u.relicId && <p class="text"><ItemText>Предъявленная вещь: {(() => { const item = v.me.items.find(i => i.id === u.relicId) ?? h.knownItems[u.relicId]; return item ? specialLabel({ ...item, id: u.relicId }, v) : 'предъявленная вещь'; })()}</ItemText></p>}{u.answer && <p class="text"><ItemText>{u.answer}</ItemText></p>}
      {u.status === 'pending' && u.targets.includes(v.me.role.key) && !u.approved.includes(v.me.role.key) && <div class="m-btns"><Button small onClick={() => void run({ type: 'hidden17.signature.respond', id: u.id, accept: true })}>Согласиться</Button><Button small kind="sec" onClick={() => void run({ type: 'hidden17.signature.respond', id: u.id, accept: false })}>Отказаться</Button></div>}
    </div>)}
    {!historyOnly && h.ritual.step === 'preparation' && <Present v={v} />}
  </>;
}
export function SignatureUse({ item, v }: { item: Item; v: PlayerView }) {
  const h = v.hidden17!; const [target, setTarget] = useState(v.me.role.key); const [second, setSecond] = useState('');
  const [effect, setEffect] = useState<'curse' | 'thorns'>('curse'); const [effect2, setEffect2] = useState<'curse' | 'thorns'>('curse');
  const [relicId, setRelic] = useState(''); const [question, setQuestion] = useState<'material' | 'compartment' | 'effect'>('material');
  const description = h.signatureGoods.find(g => g.id === item.ref);
  const lens = item.ref === 'inspection-lens'; const incense = item.ref === 'herbal-incense';
  const relics = Object.entries(h.knownItems).filter(([id, i]) => (question==='effect'?i.kind==='special'&&['salt','blood-vial','vessel'].includes(i.ref):i.kind === 'relic') && i.owner === target);
  const selected = relics.some(([id]) => id === relicId) ? relicId : relics[0]?.[0] ?? '';
  const ready = v.me.available.items.includes(item.id) && !!target && (!lens || !!selected);
  const effectOptions = [{ value: 'curse', label: 'Проклятие' }, { value: 'thorns', label: 'Шипы' }];
  return <details class="m-card"><summary>Применить: {SPECIAL_NAMES[item.ref]}</summary><p class="text"><ItemText>{description?.effect}</ItemText></p><p class="m-note"><ItemText>{description?.limits}</ItemText></p><div class="field"><span>{lens ? 'Владелец предъявленной вещи' : 'На кого'}</span><Select label="Цель особого изделия" value={target} onChange={setTarget} options={people(v)} /></div>
    {lens && <><div class="field"><span>{question==='effect'?'Подготовленный компонент':'Реликвия'}</span><Select label="Предъявленная реликвия" value={selected} onChange={setRelic} placeholder="Владелец должен предъявить вам вещь из своей сумки" options={relics.map(([id, i]) => ({ value: id, label: specialLabel({ ...i, id }, v) }))} /></div><div class="field"><span>Один физический вопрос</span><Select label="Вопрос линзы" value={question} onChange={s => setQuestion(s as 'material' | 'compartment' | 'effect')} options={[{ value: 'material', label: 'Из какого материала сделана вещь?' }, { value: 'compartment', label: 'Есть ли скрытое отделение?' },...(h.rulesVersion===2?[{value:'effect',label:'Для чего подготовлен компонент?'}]:[])]} /></div></>}
    {incense && <>{h.rulesVersion!==2&&<div class="field"><span>Что снять у первого участника</span><Select label="Первый эффект ладана" value={effect} onChange={s => setEffect(s as 'curse' | 'thorns')} options={effectOptions} /></div>}<div class="field"><span>Второй участник (необязательно)</span><Select label="Второй участник ладана" value={second} onChange={setSecond} options={[{ value: '', label: 'Только один участник' }, ...people(v).filter(p => p.value !== target)]} /></div>{second && h.rulesVersion!==2 && <Select label="Второй эффект ладана" value={effect2} onChange={s => setEffect2(s as 'curse' | 'thorns')} options={effectOptions} />}<p class="m-note"><ItemText>{h.rulesVersion===2?'Снимаются одновременно проклятие и Шипы. ':''}Оба участника вместе приходят в таверну. Вторую порцию нельзя оставить на потом.</ItemText></p></>}
    <Button disabled={!ready || target === second} onClick={() => ask({ title: `Применить: ${SPECIAL_NAMES[item.ref]}?`, text: 'Вещь останется в резерве до согласия участников, а затем будет потрачена.', okLabel: 'Предложить применение', onOk: () => void run({ type: 'hidden17.signature.use', itemId: item.id, targets: [target, ...(second && incense ? [second] : [])], ...(lens ? { relicId: selected, question } : {}), ...(incense ? { effects: { [target]: effect, ...(second ? { [second]: effect2 } : {}) } } : {}) }) })}>Применить с согласия</Button>
  </details>;
}
function Present({ v }: { v: PlayerView }) {
  const [itemId, setItem] = useState(''); const [player, setPlayer] = useState('');
  const items = v.me.items.filter(i => i.kind === 'relic'||v.hidden17?.rulesVersion===2&&!!v.hidden17.prepared[i.id]);
  return <details class="m-card"><summary>Предъявить вещь для осмотра</summary><p class="m-note"><ItemText>Выбранный герой увидит название этой вещи и сможет предложить осмотр линзой. Вещь останется у вас. Для применения линзы нужно отдельное согласие.</ItemText></p><Select label="Реликвия для осмотра" value={itemId} onChange={setItem} options={items.map(i => ({ value: i.id, label: specialLabel(i, v) }))} /><Select label="Кому предъявить" value={player} onChange={setPlayer} options={people(v, false)} /><div class="m-btns"><Button small disabled={!itemId || !player} onClick={() => void run({ type: 'hidden17.present', itemId, player, allow: true })}>Предъявить</Button><Button small kind="sec" disabled={!itemId || !player} onClick={() => void run({ type: 'hidden17.present', itemId, player, allow: false })}>Закончить осмотр</Button></div></details>;
}
