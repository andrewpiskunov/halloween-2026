import type { GmView } from '@fair/shared';
import { ItemText } from '../../components/ItemText';
import { Portrait } from '../../components/Portrait';
import { attentionFor, type GmAttentionEntry } from '../../gm/attention';
import { createGmStoryCard } from '../../gm/navigation';
import { requestLine } from '../../gm/actions';
import { loadedContent, now } from '../../store';
import { GmLens } from './Hidden';
import { GmDestructionScene } from './ContinuousFair';
import { StoryRequestCard } from './Story';

const who = (key: string) => loadedContent().roles.find(r => r.key === key)?.name ?? key;
const kinds: Record<GmAttentionEntry['kind'], string> = {
  story: 'Заявка', inspection: 'Осмотр', destruction: 'Осколок',
  consent: 'Согласие', production: 'Заказ', use: 'Изделие',
};
function Entry({ entry: e, v }: { entry: GmAttentionEntry; v: GmView }) {
  const s = v.state;
  const title = e.kind === 'story' ? s.story!.requests[e.id].title
    : e.kind === 'inspection' ? 'Осмотр линзой'
    : e.kind === 'destruction' ? `Осколок ${s.hidden17!.fair!.destruction[e.id].ref}`
    : e.kind === 'consent' ? requestLine(s.requests[e.id], v, loadedContent())
    : e.kind === 'production' ? `Заказ у ${who(s.hidden17!.production[e.id].maker)}`
    : 'Применение изделия';
  return <details class="gm-attention-entry" data-attention-id={e.id}>
    <summary><Portrait roleKey={e.player} emoji="☉" size="sm" /><span><small>{kinds[e.kind]} · {who(e.player)}</small><b><ItemText>{title}</ItemText></b></span><span class="gm-entry-arrow" aria-hidden="true">›</span></summary>
    {e.kind === 'story' && <StoryRequestCard key={s.story!.requests[e.id].revision} q={s.story!.requests[e.id]} v={v} onCard={createGmStoryCard} />}
    {e.kind === 'inspection' && <GmLens key={e.id} u={s.hidden17!.uses[e.id]} v={v} />}
    {e.kind === 'destruction' && <GmDestructionScene v={v} s={s.hidden17!.fair!.destruction[e.id]} />}
    {e.kind === 'consent' && <p class="text">Ждём согласия: {s.requests[e.id].approvers.filter(k => !s.requests[e.id].approved.includes(k)).map(who).join(', ')}. Просьбу можно отменить в разделе «Способности и вещи».</p>}
    {e.kind === 'production' && <p class="text">Изготовление ждёт согласия участников заказа.</p>}
    {e.kind === 'use' && <p class="text">Ждём согласия: {s.hidden17!.uses[e.id].targets.filter(k => !s.hidden17!.uses[e.id].approved.includes(k)).map(who).join(', ')}.</p>}
  </details>;
}
export function GmAttention({ v }: { v: GmView }) {
  const queue = attentionFor(v.state, now.value);
  return <section class="m-card gm-attention" aria-label="Очередь ведущего">
    <div class="gm-section-title"><h2>Требует внимания</h2><span class="gm-count" aria-label={`Дел: ${queue.ready.length}`}>{queue.ready.length}</span></div>
    <p class="m-note">Откройте дело, чтобы ответить или провести сцену.</p>
    <div class="gm-attention-ready">{queue.ready.length ? queue.ready.map(e => <Entry key={e.kind + e.id} entry={e} v={v} />) : <p class="text">Сейчас нет новых дел для ведущего.</p>}</div>
    {queue.waiting.length > 0 && <details class="gm-waiting"><summary>В работе и ожидают ответа · {queue.waiting.length}</summary><p class="m-note">Здесь выполняют ваши условия, собирают согласия или ждут окончания окна спасения.</p>{queue.waiting.map(e => <Entry key={e.kind + e.id} entry={e} v={v} />)}</details>}
  </section>;
}
