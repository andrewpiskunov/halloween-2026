import { useState } from 'preact/hooks';
import type { GmView, Side, StoryCard, StoryCardInput, StoryKind, StoryRequest } from '@fair/shared';
import { storyAct } from '../../story-rules';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { ask, loadedContent, run, showToast } from '../../store';
import { STORY_KIND, STORY_STATUS, StoryCardBody, StoryText } from '../Story';

const roles = (v: GmView) => v.state.roster.map(key => ({ value: key, label: loadedContent().roles.find(r => r.key === key)?.name ?? key, avatar: key }));
const who = (key: string) => loadedContent().roles.find(r => r.key === key)?.name ?? key;
const live = (v: GmView) => storyAct(v.state.phase) > 0;

function Readers({ v, value, onChange }: { v: GmView; value: string[]; onChange: (s: string[]) => void }) {
  return <div class="story-readers">{roles(v).map(r => <label class="check" key={r.value}>
    <input type="checkbox" checked={value.includes(r.value)} onChange={e => onChange(e.currentTarget.checked ? [...value, r.value] : value.filter(k => k !== r.value))} />{r.label}
  </label>)}</div>;
}

const fresh = (kind: StoryKind): StoryCardInput => ({ kind, owner: '', title: '', text: '', price: '', visibility: 'private', readers: [], uses: kind === 'ability' || kind === 'item' ? 1 : null, duration: 'game', replacesAbility: false, active: true, completed: false });

function CardEditor({ v, initial, kind, owner, onDone }: { v: GmView; initial?: StoryCard; kind: StoryKind; owner?: string; onDone: () => void }) {
  const [form, setForm] = useState<StoryCardInput>(initial ?? { ...fresh(kind), owner: owner ?? '' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof StoryCardInput>(k: K, value: StoryCardInput[K]) => setForm({ ...form, [k]: value });
  const save = async () => {
    setBusy(true);
    try {
      const r = await run({ type: 'story.card.save', ...(initial ? { id: initial.id, revision: initial.revision } : {}), card: form });
      if (r.ok) { showToast(initial ? 'Карточка обновлена' : 'Карточка выдана'); onDone(); }
    } finally { setBusy(false); }
  };
  return <div class="m-card story-editor">
    <h5>{initial ? 'Изменить' : 'Выдать'} · {STORY_KIND[form.kind]}</h5>
    <div class="field"><span>Владелец</span><Select label="Владелец карточки" value={form.owner} onChange={k => set('owner', k)} options={roles(v)} /></div>
    <StoryText label="Название карточки" value={form.title} onChange={s => set('title', s)} max={120} small />
    <StoryText label="Что действует: эффект, задача или условия договора" value={form.text} onChange={s => set('text', s)} />
    <StoryText label="Цена, ограничения и способ освобождения" value={form.price} onChange={s => set('price', s)} max={500} />
    <div class="field"><span>Срок действия</span><Select label="Срок действия" value={form.duration} onChange={s => set('duration', s as 'act' | 'game')} options={[{ value: 'game', label: 'До конца игры или отмены' }, { value: 'act', label: 'До конца текущего акта' }]} /></div>
    {['ability', 'item'].includes(form.kind) && <label class="field"><span>Оставшиеся применения (пусто — без ограничения)</span><input type="number" min={0} max={99} step={1} value={form.uses ?? ''} onInput={e => set('uses', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></label>}
    {form.kind === 'ability' && <label class="check"><input type="checkbox" checked={form.replacesAbility} onChange={e => set('replacesAbility', e.currentTarget.checked)} />Заменить основную способность на время действия</label>}
    {form.kind === 'goal' && <label class="check"><input type="checkbox" checked={form.completed} onChange={e => set('completed', e.currentTarget.checked)} />Цель выполнена</label>}
    <label class="check"><input type="checkbox" checked={form.active} onChange={e => set('active', e.currentTarget.checked)} />Карточка действует</label>
    <label class="check"><input type="checkbox" checked={form.visibility === 'public'} onChange={e => set('visibility', e.currentTarget.checked ? 'public' : 'private')} />Показать всем участникам</label>
    {form.visibility === 'private' && <details><summary>Кто ещё видит карточку (владелец видит всегда)</summary><Readers v={v} value={form.readers} onChange={r => set('readers', r)} /></details>}
    <p class="m-note">Произвольный эффект и цену проводите вручную. Приложение хранит описание и считает подтверждённые применения. Предмет передаётся сменой владельца здесь.</p>
    <div class="m-btns"><Button disabled={busy || !live(v) || !form.owner || !form.title.trim() || !form.text.trim()} onClick={() => ask({ title: `Выдать «${form.title}» — ${who(form.owner)}?`, text: form.visibility === 'public' ? 'Карточку увидят все.' : 'Карточку увидят владелец и выбранные участники.', okLabel: 'Сохранить', onOk: save })}>Сохранить карточку</Button><Button kind="sec" onClick={onDone}>Закрыть редактор</Button></div>
  </div>;
}

function Request({ q, v, onCard }: { q: StoryRequest; v: GmView; onCard: (owner: string) => void }) {
  const [reply, setReply] = useState(q.reply);
  const [busy, setBusy] = useState(false);
  const open = ['pending', 'conditions'].includes(q.status);
  const respond = (status: 'conditions' | 'done' | 'rejected') => ask({
    title: status === 'done' ? 'Подтвердить результат?' : status === 'conditions' ? 'Отправить условия?' : 'Отклонить заявку?',
    text: status === 'done' && q.cardId ? 'Спишется одно применение карточки. Цену и остальные последствия проведите вручную.' : reply,
    okLabel: 'Отправить', onOk: async () => {
      setBusy(true);
      try { await run({ type: 'story.respond', id: q.id, revision: q.revision, status, reply }); } finally { setBusy(false); }
    },
  });
  return <div class={`m-card ${q.status === 'pending' ? 'hot' : ''}`}>
    <h5>{who(q.author)} · {STORY_STATUS[q.status]}</h5><h4>{q.title}</h4><p class="text story-prose">{q.text}</p>
    {q.stake && <p class="text">Предлагает: {q.stake}</p>}
    {q.cardId && <p class="m-note">Применение: {v.state.story?.cards[q.cardId]?.title ?? 'карточка снята'}</p>}
    {q.reply && <div class="story-reply"><b>Последний ответ</b><p class="text story-prose">{q.reply}</p></div>}
    {open && live(v) && <>
      <StoryText label="Условия или результат заявки" value={reply} onChange={setReply} />
      <div class="m-btns"><Button small disabled={busy || !reply.trim()} onClick={() => respond('conditions')}>Предложить условия</Button><Button small disabled={busy || !reply.trim()} onClick={() => respond('done')}>Подтвердить результат</Button><Button small kind="sec" disabled={busy || !reply.trim()} onClick={() => respond('rejected')}>Отклонить</Button></div>
      <Button small kind="sec" onClick={() => onCard(q.author)}>Создать результат-карточку</Button>
    </>}
  </div>;
}

function MessageForm({ v }: { v: GmView }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return <div class="m-card"><h5>Послание ведущего</h5>
    <StoryText label="Заголовок послания" value={title} onChange={setTitle} max={120} small />
    <StoryText label="Текст послания" value={text} onChange={setText} />
    <label class="check"><input type="checkbox" checked={all} onChange={e => setAll(e.currentTarget.checked)} />Объявить всем</label>
    {!all && <Readers v={v} value={recipients} onChange={setRecipients} />}
    <Button disabled={!live(v) || busy || !title.trim() || !text.trim() || !all && !recipients.length} onClick={() => ask({ title: all ? 'Отправить всем?' : 'Отправить выбранным участникам?', text: all ? title : recipients.map(who).join(', '), okLabel: 'Отправить', onOk: async () => {
      setBusy(true);
      try { const r = await run({ type: 'story.message', title, text, recipients: all ? [] : recipients }); if (r.ok) { setTitle(''); setText(''); showToast('Послание отправлено'); } } finally { setBusy(false); }
    } })}>Отправить послание</Button>
  </div>;
}

function SideForm({ v }: { v: GmView }) {
  const [player, setPlayer] = useState('');
  const [side, setSide] = useState('');
  const [reason, setReason] = useState('');
  const options = [{ value: 'base', label: 'Вернуть обычную сторону роли' }, { value: 'free', label: 'Свободный, без стороны' },
    ...loadedContent().factions.filter(f => f.id !== 'free' && v.state.altars[f.id]).map(f => ({ value: f.id, label: f.name }))];
  return <div class="m-card"><h5>Изменить сторону персонажа</h5>
    <Select label="Кому изменить сторону" value={player} onChange={setPlayer} options={roles(v)} />
    <Select label="Новая сторона" value={side} onChange={setSide} options={options} />
    <StoryText label="Причина перехода" value={reason} onChange={setReason} max={500} />
    <p class="m-note">Новая сторона будет учтена в финале. Старые вклады и личные цели сохраняются. При необходимости отдельно измените договорённости и вклады.</p>
    <Button disabled={!live(v) || !player || !side || !reason.trim()} onClick={() => ask({ title: `Изменить сторону — ${who(player)}?`, text: options.find(o => o.value === side)?.label, okLabel: 'Изменить', onOk: async () => {
      const r = await run({ type: 'story.side', player, side: side === 'base' ? null : side as Side, reason }); if (r.ok) showToast('Сторона изменена');
    } })}>Изменить сторону</Button>
  </div>;
}

export function GmStory({ v }: { v: GmView }) {
  const [section, setSection] = useState<'requests' | 'cards' | 'messages' | 'history'>('requests');
  const [edit, setEdit] = useState<{ kind: StoryKind; card?: StoryCard; owner?: string } | null>(null);
  const [closed, setClosed] = useState(false);
  const s = v.state.story;
  const pending = Object.values(s?.requests ?? {}).filter(q => q.status === 'pending').length;
  const requests = Object.values(s?.requests ?? {}).filter(q => closed || ['pending', 'conditions'].includes(q.status)).reverse();
  const create = (owner: string) => { setSection('cards'); setEdit({ kind: 'item', owner }); };
  return <>
    <h2 class="scr-h">Сюжет <small>{pending} новых заявок</small></h2>
    {!live(v) && <p class="m-note">Вмешательства доступны во время актов. История сохранена для просмотра.</p>}
    <div class="m-btns">{([['requests', 'Заявки'], ['cards', 'Карточки'], ['messages', 'Послания'], ['history', 'История']] as const).map(([key, label]) => <Button small key={key} kind={section === key ? 'main' : 'sec'} onClick={() => setSection(key)}>{label}</Button>)}</div>
    {section === 'requests' && <>
      <p class="m-note">На заявку можно ответить условиями, подтвердить результат или предложить другой путь. Для нового эффекта выдайте карточку. Цена и последствия проводятся отдельно.</p>
      <label class="check"><input type="checkbox" checked={closed} onChange={e => setClosed(e.currentTarget.checked)} />Показать завершённые заявки</label>
      {!requests.length && <p class="m-note">Открытых заявок пока нет. Игроки отправляют их из «Событий».</p>}
      {requests.map(q => <Request key={`${q.id}-${q.revision}`} q={q} v={v} onCard={create} />)}
    </>}
    {section === 'cards' && <>
      <div class="m-btns">{(Object.keys(STORY_KIND) as StoryKind[]).map(kind => <Button small key={kind} disabled={!live(v)} onClick={() => setEdit({ kind, owner: edit?.owner })}>+ {STORY_KIND[kind]}</Button>)}</div>
      {edit && <CardEditor key={`${edit.card?.id ?? 'new'}-${edit.kind}-${edit.owner ?? ''}`} v={v} initial={edit.card} kind={edit.kind} owner={edit.owner} onDone={() => setEdit(null)} />}
      {Object.values(s?.cards ?? {}).reverse().map(c => <div class="m-card" key={c.id}>
        <StoryCardBody c={c} phase={v.state.phase} /><p class="m-note">Владелец: {who(c.owner)} · {c.visibility === 'public' ? 'видят все' : `видят: ${[c.owner, ...c.readers].map(who).join(', ')}`}</p>
        <Button small kind="sec" disabled={!live(v)} onClick={() => setEdit({ kind: c.kind, card: c })}>Изменить карточку</Button>
      </div>)}
      {!v.state.hidden17 && <SideForm v={v} />}
    </>}
    {section === 'messages' && <MessageForm v={v} />}
    {section === 'history' && <>
      <p class="m-note">Отмена восстанавливает данные карточки, ответ или сторону. Слова, уже прочитанные игроками, и отдельно проведённые ресурсы автоматически не возвращаются. Если объект изменился позже, отмена будет отклонена.</p>
      {[...(s?.history ?? [])].reverse().map(h => <div class="m-card" key={h.id}><h5>{new Date(h.at).toLocaleTimeString('ru-RU')}{h.undone ? ' · отменено' : ''}</h5><p class="text">{h.label}</p><Button small kind="sec" disabled={!live(v) || h.undone} onClick={() => ask({ title: 'Отменить вмешательство?', text: h.label, okLabel: 'Отменить изменение', onOk: () => void run({ type: 'story.undo', id: h.id }) })}>Отменить вмешательство</Button></div>)}
    </>}
  </>;
}
