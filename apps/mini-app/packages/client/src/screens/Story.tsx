import { ItemText } from '../components/ItemText';
import { navigateTab } from '../narrative-navigation';
import { useState } from 'preact/hooks';
import type { PlayerView, StoryCard, StoryKind, StoryRequest } from '@fair/shared';
import { storyAct, storyCardActive } from '../story-rules';
import { Button } from '../components/Button';
import { ask, run, showToast, tab } from '../store';
import { plainName } from '../labels';

export const STORY_KIND: Record<StoryKind, string> = { item: 'Предмет', ability: 'Способность', state: 'Состояние', goal: 'Цель', contract: 'Договор' };
export const STORY_STATUS: Record<StoryRequest['status'], string> = { pending: 'Ждёт ведущего', conditions: 'Есть условия', done: 'Исполнено', rejected: 'Отклонено', cancelled: 'Отозвано' };

export function StoryText({ label, value, onChange, max = 2000, small = false }: { label: string; value: string; onChange: (s: string) => void; max?: number; small?: boolean }) {
  return <label class="field"><span>{label}</span>{small
    ? <input value={value} maxLength={max} onInput={e => onChange(e.currentTarget.value)} />
    : <textarea rows={3} value={value} maxLength={max} onInput={e => onChange(e.currentTarget.value)} />}</label>;
}

export function StoryCardBody({ c, phase }: { c: StoryCard; phase: PlayerView['phase'] }) {
  const active = storyCardActive(c, phase);
  return <>
    <h5>{STORY_KIND[c.kind]}{!c.active ? ' · снято' : !active ? ' · срок истёк' : ''}{c.kind === 'goal' && c.completed ? ' · выполнено' : ''}</h5>
    <h4>{c.title}</h4><p class="text story-prose"><ItemText>{c.text}</ItemText></p>
    {c.price && <p class="text story-prose"><ItemText><b>Цена и условия:</b> {c.price}</ItemText></p>}
    <p class="m-note"><ItemText>{c.expiresAct === null ? 'До конца игры или отмены ведущим' : `До конца акта ${c.expiresAct}`}.
      {['ability', 'item'].includes(c.kind) && ` Применений: ${c.uses === null ? 'без ограничения' : c.uses}. Результат подтверждает ведущий.`}
      {c.replacesAbility && ' Основная способность заменена, пока действует эта карточка.'}
      {c.kind === 'state' && ' Следуйте описанию состояния; вы продолжаете участвовать в игре.'}
    </ItemText></p>
  </>;
}

function RequestForm({ card, onDone }: { card?: StoryCard; onDone: () => void }) {
  const [title, setTitle] = useState(card ? `Применить: ${card.title}`.slice(0, 120) : '');
  const [text, setText] = useState('');
  const [stake, setStake] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await run({ type: 'story.request', title: title.trim(), text: text.trim(), stake: stake.trim(), ...(card ? { cardId: card.id } : {}) });
      if (r.ok) { onDone(); showToast('Заявка отправлена ведущему'); }
    } finally { setBusy(false); }
  };
  return <div class="story-form">
    <StoryText label="Название заявки" value={title} onChange={setTitle} max={120} small />
    <StoryText label="Чего хотите добиться и как будете действовать" value={text} onChange={setText} />
    <StoryText label="Что предлагаете потратить или чем рискуете (необязательно)" value={stake} onChange={setStake} max={500} />
    <p class="m-note"><ItemText>Заявка и ответ видны только вам и ведущему. Сначала дождитесь решения: сама отправка не тратит ресурсы.</ItemText></p>
    <div class="m-btns"><Button disabled={busy || !title.trim() || !text.trim()} onClick={() => void send()}>Отправить заявку</Button><Button kind="sec" onClick={onDone}>Закрыть форму</Button></div>
  </div>;
}

function PlayerCard({ c, v }: { c: StoryCard; v: PlayerView }) {
  const [using, setUsing] = useState(false);
  const mine = c.owner === v.me.role.key;
  const pending = v.story?.requests.some(q => q.cardId === c.id && ['pending', 'conditions'].includes(q.status));
  const usable = mine && storyAct(v.phase) > 0 && storyCardActive(c, v.phase) && c.uses !== 0 && ['ability', 'item'].includes(c.kind);
  return <div class="m-card story-card">
    <StoryCardBody c={c} phase={v.phase} />
    {!mine && <p class="m-note"><ItemText>Владелец: {plainName(c.owner, v)}</ItemText></p>}
    {pending && <p class="ab-state"><ItemText>Применение ждёт решения ведущего. Ответ — в «Событиях».</ItemText></p>}
    {usable && !pending && <Button kind="sec" onClick={() => setUsing(!using)}>Попросить применить</Button>}
    {using && usable && !pending && <RequestForm card={c} onDone={() => setUsing(false)} />}
    {c.kind === 'item' && mine && <p class="m-note"><ItemText>Для передачи этого предмета договоритесь с игроком и обратитесь к ведущему.</ItemText></p>}
  </div>;
}

/** Краткие карточки на роли/в сумке, полная история и свободная заявка — в событиях. */
export function StoryCards({ v, items = false }: { v: PlayerView; items?: boolean }) {
  const cards = v.story?.cards.filter(c => c.owner === v.me.role.key && (items ? c.kind === 'item' : c.kind !== 'item')) ?? [];
  return <>{cards.map(c => <PlayerCard key={c.id} c={c} v={v} />)}</>;
}

export function PlayerStory({ v }: { v: PlayerView }) {
  const [compose, setCompose] = useState(false);
  const live = storyAct(v.phase) > 0;
  const requests = [...(v.story?.requests ?? [])].reverse();
  return <section class="story-stack">
    <div class="m-card">
      <h5>Свободная заявка ведущему</h5>
      <p class="text"><ItemText>Придумайте обряд, сделку с магией или необычный поступок. Расскажите, чего хотите добиться, как и чем готовы рискнуть. Ведущий предложит условия и последствия.</ItemText></p>
      {live ? <Button onClick={() => setCompose(!compose)}>Новая заявка</Button> : <p class="m-note"><ItemText>Заявки доступны во время актов.</ItemText></p>}
      {compose && live && <RequestForm onDone={() => setCompose(false)} />}
    </div>
    {[...(v.story?.messages ?? [])].reverse().map(m => <div class="m-card hot" key={m.id}><h5>Послание ведущего{m.recipients.length ? ' · личное' : ' · всем'}</h5><h4>{m.title}</h4><p class="text story-prose"><ItemText>{m.text}</ItemText></p></div>)}
    {requests.map(q => <div class="m-card" key={q.id}>
      <h5>Ваша заявка · {STORY_STATUS[q.status]}</h5><h4>{q.title}</h4><p class="text story-prose"><ItemText>{q.text}</ItemText></p>
      {q.stake && <p class="text"><ItemText>Предложенная цена: {q.stake}</ItemText></p>}
      {q.reply && <div class="story-reply"><b>Ответ ведущего</b><p class="text story-prose"><ItemText>{q.reply}</ItemText></p></div>}
      {live && ['pending', 'conditions'].includes(q.status) && <Button small kind="sec" onClick={() => ask({ title: 'Отозвать заявку?', onOk: () => void run({ type: 'story.cancel', id: q.id, revision: q.revision }) })}>Отозвать заявку</Button>}
      {q.status === 'conditions' && <p class="m-note"><ItemText>Выполните условия и сообщите ведущему. Он подтвердит результат этой заявки.</ItemText></p>}
    </div>)}
    {(v.story?.cards ?? []).map(c => <PlayerCard key={c.id} c={c} v={v} />)}
  </section>;
}

export function StoryInvite() {
  return <div class="m-card"><h5>Можно больше, чем написано в карточке</h5><p class="text"><ItemText>Есть необычная идея? Предложите её ведущему: он может назначить обряд, выдать новую вещь или изменить вашу историю.</ItemText></p><Button kind="sec" onClick={() => navigateTab('events')}>Заявки и послания</Button></div>;
}
