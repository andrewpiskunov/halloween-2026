import { useState } from 'preact/hooks';
import type { GmView } from '@fair/shared';
import { Button } from '../../components/Button';
import { ItemText } from '../../components/ItemText';
import { portraitUrl } from '../../assets';
import { storyAct } from '../../story-rules';
import { ask, loadedContent, run, showToast } from '../../store';
import { StoryText } from '../Story';

export function MessageForm({ v }: { v: GmView }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [all, setAll] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const who = (key: string) => loadedContent().roles.find(r => r.key === key)?.name ?? key;
  const audience = recipients.filter(k => v.state.roster.includes(k));
  const live = storyAct(v.state.phase) > 0;
  const messages = [
    ...v.state.announcements.map((a, i) => ({ ...a, id: `announcement-${i}`, recipients: [] as string[], active: true })),
    ...(v.state.story?.messages ?? []),
  ].sort((a, b) => b.at - a.at);
  return <>
    <section class="m-card gm-message-form"><h3>Послание ведущего</h3>
      <fieldset class="gm-audience"><legend>Кому отправить</legend>
        <label><input type="radio" name="gm-audience" checked={all} onChange={() => setAll(true)} />Всем на ярмарке</label>
        <label><input type="radio" name="gm-audience" checked={!all} onChange={() => setAll(false)} />Выбранным героям</label>
      </fieldset>
      {!all && <div class="gm-recipient-grid">{v.state.roster.map(key => <label key={key}><input type="checkbox" checked={audience.includes(key)} onChange={e => setRecipients(e.currentTarget.checked ? [...audience, key] : audience.filter(k => k !== key))} /><img src={portraitUrl(key)} alt="" width="32" height="32" /><span>{who(key)}</span></label>)}</div>}
      <p class="m-note">{all ? 'Объявление появится на общей доске в таверне.' : `Личное послание. Получатели: ${audience.map(who).join(', ') || 'пока не выбраны'}.`}</p>
      <StoryText label="Заголовок послания" value={title} onChange={setTitle} max={120} small />
      <StoryText label="Текст послания" value={text} onChange={setText} />
      {!all && !live && <p class="m-note">Личные послания доступны во время ярмарки.</p>}
      <Button disabled={busy || !title.trim() || !text.trim() || !all && (!live || !audience.length)} onClick={() => ask({
        title: all ? 'Опубликовать для всех?' : 'Отправить личное послание?',
        text: `${all ? 'Все участники' : audience.map(who).join(', ')}. ${title.trim()}\n${text.trim()}`,
        okLabel: 'Отправить', onOk: async () => {
          setBusy(true);
          try {
            const r = await run({ type: 'story.message', title: title.trim(), text: text.trim(), recipients: all ? [] : audience });
            if (r.ok) { setTitle(''); setText(''); setRecipients([]); showToast(all ? 'Объявление опубликовано' : 'Личное послание отправлено'); }
          } finally { setBusy(false); }
        },
      })}>Отправить послание</Button>
    </section>
    <details class="m-card"><summary>Послания и объявления · {messages.length}</summary>
      {(history ? messages : messages.slice(0, 10)).map(m => <article class="gm-message-history" key={m.id}><small>{new Date(m.at).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})} · {m.recipients.length ? m.recipients.map(who).join(', ') : 'Всем'}{!m.active && ' · отозвано'}</small><h4>{m.title}</h4><p class="text story-prose"><ItemText>{m.text}</ItemText></p></article>)}
      {!messages.length && <p class="m-note">Посланий пока нет.</p>}
      {messages.length > 10 && <Button kind="sec" small onClick={() => setHistory(!history)}>{history ? 'Только последние' : 'Показать все'}</Button>}
    </details>
  </>;
}
