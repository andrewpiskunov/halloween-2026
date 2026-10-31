import { ItemText } from '../../components/ItemText';
import type { GmView } from '@fair/shared';
import { Button } from '../../components/Button';
import { OUTCOME_TEXTS, OUTCOME_TITLES, altarChecklist, altarName, altarRows, closeBlock, playerSummary } from '../../gm/closing';
import { ask, loadedContent, run, showToast } from '../../store';

/** Текст подтверждения закрытия (спецификация этапа 5, §6.5). */
const CLOSE_TEXT = 'Сделки и просьбы отменятся, лоты закроются, инвентари заморозятся. Ярмарку нельзя будет открыть снова';

/**
 * «Итоги» на пульте (спецификация этапа 5, §6.5): до закрытия чек-лист алтарей и кнопка закрытия,
 * после — алтари, исход с текстом для чтения вслух, предупреждения, «Правда», сводка и показ результатов.
 */
export function Results({ v }: { v: GmView }) {
  const { state } = v;
  const content = loadedContent();
  const c = state.closing;
  if (!c) return <BeforeClose v={v} />;
  const name = (k: string) => content.roles.find(r => r.key === k)?.name ?? k;
  const revealed = state.phase === 'revealed';
  return (
    <>
      <h2 class="scr-h">Итоги</h2>
      <div class="m-card">
        <h5>Алтари</h5>
        {c.altars.map(a => (
          <div class="gm-altar" key={a.side}>
            <div class="m-row"><span>{altarName(a.side, content)}</span>{a.ready ? <b>готов</b> : <small>не готов</small>}</div>
            <ul class="altar-need">{altarRows(a).map(r => <li key={r}><ItemText>{r}</ItemText></li>)}</ul>
          </div>
        ))}
      </div>

      <div class="m-card outcome">
        <h5>Исход: прочитать вслух</h5>
        <h4>{OUTCOME_TITLES[c.outcome]}</h4>
        <p class="text"><ItemText>{OUTCOME_TEXTS[c.outcome]}</ItemText></p>
      </div>

      {c.warnings.length > 0 && (
        <div class="m-card">
          <h5>Предупреждения</h5>
          {c.warnings.map(w => <p class="m-note warn" key={w}><ItemText>{w}</ItemText></p>)}
        </div>
      )}

      {c.truthHolder !== undefined ? (
        <div class="secret">
          <span class="seal" aria-hidden="true">☽</span>
          <b>Правду держит: {name(c.truthHolder)}</b>
          <p><ItemText>{content.story.truth}</ItemText></p>
          <p class="m-note"><ItemText>{content.story.truth_read}</ItemText></p>
        </div>
      ) : (
        <div class="m-card"><h5>Правда</h5><p class="m-note"><ItemText>Улики разошлись, Правда не рассказана</ItemText></p></div>
      )}

      <div class="m-card">
        <h5>Достижения игроков</h5>
        {playerSummary(c, state, content).map(line => <div class="m-row gm-summary" key={line}><span>{line}</span></div>)}
        <p class="m-note"><ItemText>Исправления делаются на «Пульте»; итоги здесь пересчитаются сами.</ItemText></p>
      </div>

      <div class="m-card">
        {revealed
          ? <p class="m-note" style={{ textAlign: 'center' }}><ItemText>Результаты показаны</ItemText></p>
          : <Button onClick={() => ask({
            title: 'Показать результаты?', okLabel: 'Показать',
            text: 'Игроки увидят исход, свои цели и достижения на вкладке «Итоги».',
            onOk: () => { void run({ type: 'session.reveal' }).then(r => { if (r.ok) showToast('Результаты показаны'); }); },
          })}>Показать результаты</Button>}
      </div>
    </>
  );
}

/** До закрытия: предпросмотр алтарей и кнопка «Закрыть ярмарку» с пояснением, если закрыть нельзя. */
function BeforeClose({ v }: { v: GmView }) {
  const { state } = v;
  const content = loadedContent();
  const block = closeBlock(state);
  const list = altarChecklist(state, content);
  return (
    <>
      <h2 class="scr-h">Итоги</h2>
      <div class="m-card">
        <h5>Готовность алтарей</h5>
        {list.length === 0 && <p class="m-note"><ItemText>Алтари появятся, когда ярмарка откроется.</ItemText></p>}
        {list.map(a => (
          <div class="gm-altar" key={a.side}>
            <div class="m-row"><span>{a.name}</span>{a.ready ? <b>готов</b> : <small>не готов</small>}</div>
            <ul class="altar-need">{a.rows.map(r => <li key={r}><ItemText>{r}</ItemText></li>)}</ul>
          </div>
        ))}
        {list.filter(a => a.ready).length > 1 && <p class="m-note warn"><ItemText>Готовы два алтаря и больше: при закрытии сердце уснёт. Проверьте вклады.</ItemText></p>}
      </div>
      <div class="m-card">
        <Button kind="red" disabled={block !== null} onClick={() => ask({
          title: 'Закрыть ярмарку?', text: CLOSE_TEXT, okLabel: 'Закрыть', danger: true,
          onOk: () => { void run({ type: 'session.close' }); },
        })}>Закрыть ярмарку</Button>
        {block && <p class="m-note" style={{ textAlign: 'center' }}><ItemText>{block}</ItemText></p>}
      </div>
    </>
  );
}
