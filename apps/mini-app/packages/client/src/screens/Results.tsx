import { ItemText } from '../components/ItemText';
import { NarrativeGoals } from './NarrativeRole';
import { Outcome } from './Ritual';
import { roleName } from '../labels';
import { PlayerStory } from './Story';
import type { PlayerView } from '@fair/shared';

/**
 * «Итоги» после объявления (спецификация этапа 5, §6.3): исход и его текст, мои достижения,
 * моя сторона и, если «Правду» держит кто-то, напоминание, что её расскажет ведущий.
 * Вкладки «События» в revealed нет, поэтому три последних объявления ведущего видны здесь.
 */
export function Results({ v }: { v: PlayerView }) {
  if (v.hidden17) return <><h2 class="scr-h">Ваш эпилог</h2>{v.hidden17.ritual.outcome ? <Outcome outcome={v.hidden17.ritual.outcome} name={k => roleName(k, v)} /> : <p class="m-note"><ItemText>Итоги ещё не объявлены.</ItemText></p>}{v.hidden17.narrative ? <NarrativeGoals v={v}/> : <div class="m-card"><h5>Личные достижения</h5>{v.me.goals.map((g, i) => <Row key={i} ok={g.done} text={g.text} />)}</div>}<PlayerStory v={v} /></>;
  const c = v.closing;
  if (!c) return <div class="m-card"><p class="m-note"><ItemText>Итоги ещё не объявлены.</ItemText></p></div>;
  const recent = [...v.announcements].slice(-3).reverse();
  const side = c.me.side === 'free' ? undefined : v.public.factions.find(f => f.id === c.me.side);
  return (
    <>
      <h2 class="scr-h">Итоги</h2>
      <div class="m-card outcome">
        <h5>Исход ярмарки</h5>
        <h4>{c.title}</h4>
        <p class="text"><ItemText>{c.text}</ItemText></p>
      </div>

      {recent.length > 0 && (
        <>
          <h2 class="scr-h">Объявления</h2>
          <div class="feed">
            {recent.map((a, i) => (
              <div class="m-card" key={`${a.at}-${i}`}>
                <time>{new Date(a.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
                <b>{a.title}</b>
                <p class="hand"><ItemText>{a.text}</ItemText></p>
              </div>
            ))}
          </div>
        </>
      )}

      <div class="m-card">
        <h5>Ваши достижения</h5>
        {c.me.outcome && <Row ok text="Желаемый исход" />}
        {c.me.truth && <Row ok text="Правда" />}
        {v.me.goals.map((g, i) => <Row key={i} ok={g.done} text={g.text} />)}
        {side
          ? <div class="side-line results-side" style={{ '--side': side.color }}><i aria-hidden="true" /><span>Сторона: {side.name}</span></div>
          : <p class="m-note"><ItemText>Сторона не выбрана</ItemText></p>}
      </div>

      {(v.story?.cards ?? []).filter(c => c.kind === 'goal' && c.owner === v.me.role.key).map(c => <div class="m-card" key={c.id}><h5>Сюжетная цель</h5><Row ok={c.completed} text={c.title} /><p class="text"><ItemText>{c.text}</ItemText></p></div>)}
      <PlayerStory v={v} />
      {c.truthTold && (
        <div class="secret">
          <span class="seal" aria-hidden="true">☽</span>
          <b>Правда</b>
          <p><ItemText>Правду расскажет ведущий</ItemText></p>
        </div>
      )}
    </>
  );
}

/** Строка достижения: галочка или крест и текст. */
function Row({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div class={`achv ${ok ? 'ok' : 'no'}`}>
      <b aria-label={ok ? 'выполнено' : 'не выполнено'}>{ok ? '✓' : '✗'}</b>
      <span>{text}</span>
    </div>
  );
}
