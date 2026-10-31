import { useState } from 'preact/hooks';
import type { Item, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { ask, run } from '../store';
import { roleName } from '../labels';
import { SPECIAL_NAMES, people } from './HiddenCommon';

export function SignatureGoods({ v, historyOnly = false }: { v: PlayerView; historyOnly?: boolean }) {
  const h = v.hidden17!;
  const items = v.me.items.filter(i => i.kind === 'special' && ['shape-fixative', 'inspection-lens', 'herbal-incense'].includes(i.ref));
  return <>
    {!historyOnly && items.map(i => <SignatureUse key={i.id} item={i} v={v} />)}
    {h.uses.map(u => <div class="m-card" key={u.id}><h5>{SPECIAL_NAMES[u.ref] ?? 'Особое изделие'}</h5><p class="text">{h.signatureGoods.find(g => g.id === u.ref)?.effect}</p>{u.guise && <p class="text">Закрепляемый облик: {u.guise}</p>}<p class="text">{roleName(u.author, v)} → {u.targets.map(k => roleName(k, v)).join(', ')}</p><p class="m-note">{u.status === 'pending' ? 'Ждёт согласия' : u.status === 'completed' ? 'Применено' : 'Отменено'}{u.question ? ` · ${u.question === 'material' ? 'материал реликвии' : 'скрытое отделение'}` : ''}{u.effects && Object.entries(u.effects).map(([k, e]) => ` · ${roleName(k, v)}: снять ${e === 'curse' ? 'проклятие' : 'шипы'}`).join('')}</p>{u.relicId && <p class="text">Реликвия: {h.knownItems[u.relicId]?.ref ?? v.me.items.find(i => i.id === u.relicId)?.ref ?? 'предъявленная вещь'}</p>}{u.answer && <p class="text">{u.answer}</p>}
      {u.status === 'pending' && u.targets.includes(v.me.role.key) && !u.approved.includes(v.me.role.key) && <div class="m-btns"><Button small onClick={() => void run({ type: 'hidden17.signature.respond', id: u.id, accept: true })}>Согласиться</Button><Button small kind="sec" onClick={() => void run({ type: 'hidden17.signature.respond', id: u.id, accept: false })}>Отказаться</Button></div>}
    </div>)}
    {!historyOnly && h.ritual.step === 'preparation' && <Present v={v} />}
  </>;
}
export function SignatureUse({ item, v }: { item: Item; v: PlayerView }) {
  const h = v.hidden17!; const [target, setTarget] = useState(v.me.role.key); const [second, setSecond] = useState('');
  const [effect, setEffect] = useState<'curse' | 'thorns'>('curse'); const [effect2, setEffect2] = useState<'curse' | 'thorns'>('curse');
  const [relicId, setRelic] = useState(''); const [question, setQuestion] = useState<'material' | 'compartment'>('material');
  const description = h.signatureGoods.find(g => g.id === item.ref);
  const lens = item.ref === 'inspection-lens'; const incense = item.ref === 'herbal-incense';
  const relics = Object.entries(h.knownItems).filter(([, i]) => i.kind === 'relic' && i.owner === target);
  const selected = relics.some(([id]) => id === relicId) ? relicId : relics[0]?.[0] ?? '';
  const ready = v.me.available.items.includes(item.id) && !!target && (!lens || !!selected);
  const effectOptions = [{ value: 'curse', label: 'Проклятие' }, { value: 'thorns', label: 'Шипы' }];
  return <details class="m-card"><summary>Применить: {SPECIAL_NAMES[item.ref]}</summary><p class="text">{description?.effect}</p><p class="m-note">{description?.limits}</p><div class="field"><span>{lens ? 'Владелец предъявленной реликвии' : 'На кого'}</span><Select label="Цель особого изделия" value={target} onChange={setTarget} options={people(v)} /></div>
    {lens && <><div class="field"><span>Реликвия</span><Select label="Предъявленная реликвия" value={selected} onChange={setRelic} placeholder="Владелец должен предъявить вам вещь из своей сумки" options={relics.map(([id, i]) => ({ value: id, label: i.ref }))} /></div><div class="field"><span>Один физический вопрос</span><Select label="Вопрос линзы" value={question} onChange={s => setQuestion(s as 'material' | 'compartment')} options={[{ value: 'material', label: 'Из какого материала сделана вещь?' }, { value: 'compartment', label: 'Есть ли скрытое отделение?' }]} /></div></>}
    {incense && <><div class="field"><span>Что снять у первого участника</span><Select label="Первый эффект ладана" value={effect} onChange={s => setEffect(s as 'curse' | 'thorns')} options={effectOptions} /></div><div class="field"><span>Второй участник (необязательно)</span><Select label="Второй участник ладана" value={second} onChange={setSecond} options={[{ value: '', label: 'Только один участник' }, ...people(v).filter(p => p.value !== target)]} /></div>{second && <Select label="Второй эффект ладана" value={effect2} onChange={s => setEffect2(s as 'curse' | 'thorns')} options={effectOptions} />}<p class="m-note">Оба участника вместе приходят в таверну. Вторую порцию нельзя оставить на потом.</p></>}
    <Button disabled={!ready || target === second} onClick={() => ask({ title: `Применить: ${SPECIAL_NAMES[item.ref]}?`, text: 'Вещь резервируется до согласия участников, затем расходуется.', okLabel: 'Предложить применение', onOk: () => void run({ type: 'hidden17.signature.use', itemId: item.id, targets: [target, ...(second && incense ? [second] : [])], ...(lens ? { relicId: selected, question } : {}), ...(incense ? { effects: { [target]: effect, ...(second ? { [second]: effect2 } : {}) } } : {}) }) })}>Применить с согласия</Button>
  </details>;
}
function Present({ v }: { v: PlayerView }) {
  const [itemId, setItem] = useState(''); const [player, setPlayer] = useState('');
  const items = v.me.items.filter(i => i.kind === 'relic');
  return <details class="m-card"><summary>Предъявить реликвию для осмотра</summary><p class="m-note">Выбранный герой увидит название этой вещи и сможет предложить осмотр линзой. Это не передача собственности; применение потребует отдельного согласия.</p><Select label="Реликвия для осмотра" value={itemId} onChange={setItem} options={items.map(i => ({ value: i.id, label: i.ref }))} /><Select label="Кому предъявить" value={player} onChange={setPlayer} options={people(v, false)} /><div class="m-btns"><Button small disabled={!itemId || !player} onClick={() => void run({ type: 'hidden17.present', itemId, player, allow: true })}>Предъявить</Button><Button small kind="sec" disabled={!itemId || !player} onClick={() => void run({ type: 'hidden17.present', itemId, player, allow: false })}>Закончить осмотр</Button></div></details>;
}
