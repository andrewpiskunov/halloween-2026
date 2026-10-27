import type { PlayerView } from '@fair/shared';

/**
 * «Итоги» после объявления (спецификация этапа 5, §6.3): исход и его текст, мои достижения,
 * моя сторона и, если «Правду» держит кто-то, напоминание, что её расскажет ведущий.
 */
export function Results({ v }: { v: PlayerView }) {
  const c = v.closing;
  if (!c) return <div class="m-card"><p class="m-note">Итоги ещё не объявлены.</p></div>;
  const side = c.me.side === 'free' ? undefined : v.public.factions.find(f => f.id === c.me.side);
  return (
    <>
      <h2 class="scr-h">Итоги</h2>
      <div class="m-card outcome">
        <h5>Исход ярмарки</h5>
        <h4>{c.title}</h4>
        <p class="text">{c.text}</p>
      </div>

      <div class="m-card">
        <h5>Ваши достижения</h5>
        {c.me.outcome && <Row ok text="Желаемый исход" />}
        {c.me.truth && <Row ok text="Правда" />}
        {v.me.goals.map((g, i) => <Row key={i} ok={g.done} text={g.text} />)}
        {side
          ? <div class="side-line results-side" style={{ '--side': side.color }}><i aria-hidden="true" /><span>Сторона: {side.name}</span></div>
          : <p class="m-note">Сторона не выбрана</p>}
      </div>

      {c.truthTold && (
        <div class="secret">
          <span class="seal" aria-hidden="true">☽</span>
          <b>Правда</b>
          <p>Правду расскажет ведущий</p>
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
