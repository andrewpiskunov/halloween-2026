import { useRef, useState } from 'preact/hooks';
import type { GmView } from '@fair/shared';
import { AbilityArt } from '../../components/AbilityIdentity';
import { Button } from '../../components/Button';
import { ItemText } from '../../components/ItemText';
import { Portrait } from '../../components/Portrait';
import { Select } from '../../components/Select';
import { documentImageUrl, itemImageUrl, resourceImageUrl } from '../../assets';
import { createGmStoryCard, openGmPanel } from '../../gm/navigation';
import { playerMarks } from '../../gm/player';
import { INGREDIENTS } from '../../labels';
import { loadedContent } from '../../store';
import { StoryCardBody, STORY_STATUS } from '../Story';
import { methodLabel, SPECIAL_NAMES } from '../HiddenCommon';
import { Correction } from './Correction';
import { GmNarrativeGoals } from './Narrative';
import { StoryRequestCard } from './Story';
import type { FixPreset } from './Abilities';

export function Dossier({ v, player }: { v: GmView; player: string }) {
  const data = loadedContent(), s = v.state, p = s.players[player];
  const role = data.roles.find(r => r.key === player);
  const [fix, setFix] = useState<FixPreset | null>(null);
  const correction = useRef<HTMLDetailsElement>(null);
  const selectFix = (preset: FixPreset) => {
    if (correction.current) correction.current.open = true;
    setFix(preset);
  };
  if (!p || !role) return <div class="m-card"><p>Герой больше не входит в эту партию.</p></div>;
  const h = s.hidden17, n = h?.narrative, narrative = data.hidden17?.narrative;
  const ownStory = narrative?.roles[player];
  const who = (key: string) => data.roles.find(r => r.key === key)?.name ?? key;
  const free = v.available?.[player];
  const stock = [{ key: 'gold' as const, name: 'Золото', total: p.gold, free: free?.gold },
    ...INGREDIENTS.map(i => ({ key: i.key, name: i.name, total: p.ingredients[i.key], free: free?.ingredients[i.key] }))].filter(r => r.total !== 0);
  const items = Object.values(s.items).filter(i => i.owner.type === 'player' && i.owner.key === player);
  const documents = narrative?.documents.filter(d => d.holders.includes(player) || (n?.documentAccess[player] ?? []).includes(d.id)) ?? [];
  const methods = data.hidden17?.methods
    .map(m => ({ ...m, id: m.id === 'command' ? 'sign' as const : m.id as 'salt' | 'vessel' }))
    .filter(m => m.holders.includes(player) || h?.learned[player]?.includes(m.id)) ?? [];
  const requests = Object.values(s.story?.requests ?? {}).filter(q => q.author === player).sort((a, b) => b.at - a.at);
  const cards = Object.values(s.story?.cards ?? {}).filter(c => c.owner === player);
  const marks = playerMarks(p, who, !!h?.fair);
  return <div class="gm-dossier">
    <h2 class="scr-h">Досье · {role.name}</h2>
    <Select label="Герой в досье" value={player} onChange={player => openGmPanel({ kind: 'dossier', player })} options={s.roster.map(key => ({ value: key, label: who(key), avatar: key }))} />
    <section class="m-card gm-dossier-hero"><Portrait roleKey={player} emoji={role.emoji} size="big" /><div><h3>{role.name}</h3><p>{role.title}</p><span class="m-tag">{p.present ? 'На ярмарке' : 'Отсутствует'}</span></div></section>
    <section class="m-card" aria-label="Запас героя"><h3>Запас</h3>
      <div class="gm-stock">{stock.map(r => <div class="gm-stock-row" key={r.key} data-resource={r.key}><img src={resourceImageUrl(r.key)} alt="" width="40" height="40" /><div><b>{r.name}</b><span>Всего: {r.total}{r.free !== undefined && ` · свободно: ${r.free}`}</span>{r.free !== undefined && r.total !== r.free && <small>В резерве: {r.total - r.free}</small>}</div></div>)}</div>
      {!free && <p class="m-note">Свободные остатки обновляются. Переподключитесь, если они не появились.</p>}
      {!stock.length && <p class="m-note">Золота и материалов пока нет.</p>}
      <h4>Вещи · {items.length}</h4>
      {items.map(it => {
        const lore = narrative?.items[`${it.kind}:${it.ref}`];
        const name = it.kind === 'shard' ? `Осколок ${it.ref}` : lore?.name ?? SPECIAL_NAMES[it.ref] ?? data.recipes.find(r => r.id === it.ref)?.name ?? data.clues.find(c => c.id === it.ref)?.name ?? it.ref;
        const prepared = h?.prepared[it.id];
        return <details class="gm-dossier-item" key={it.id}><summary>{itemImageUrl(it) && <img src={itemImageUrl(it)} alt="" width="44" height="44" />}<span><b>{name}</b>{it.reservedFor && <small>{it.reservedFor === 'hidden17:ritual' ? 'В круге обряда' : 'В резерве'}</small>}</span></summary>
          {lore && <><p class="text"><ItemText>{lore.description}</ItemText></p><p class="m-note"><ItemText>{lore.uses}</ItemText></p></>}
          {prepared && <p class="text">Подготовлено: {methodLabel(prepared.method, !!h?.fair)}{prepared.controller && ` · донор: ${who(prepared.controller)}`}.</p>}
        </details>;
      })}
      {!items.length && <p class="m-note">Вещей пока нет.</p>}
    </section>
    <section class="m-card"><div class="gm-section-title"><AbilityArt roleKey={player} small /><h3>{v.abilities[player]?.name ?? role.skill}</h3></div>
      <p class="m-note">{p.abilityPending ? 'Ожидает согласия' : p.abilityUsedInAct ? 'Применение израсходовано' : 'Применение не израсходовано'}</p>
      {ownStory?.abilityOrigin && <p class="m-note"><ItemText>{ownStory.abilityOrigin}</ItemText></p>}
      <h4>Эффекты и отметки</h4>
      {marks.length ? <div class="gm-dossier-marks">{marks.map(m => m.field ? <Button key={m.label} small kind="sec" onClick={() => selectFix({ player, field: m.field!, on: false })}>{m.label} · исправить</Button> : <p key={m.label}>{m.label}</p>)}</div> : <p class="m-note">Действующих отметок нет.</p>}
      {cards.map(c => <details class="gm-dossier-card" key={c.id}><summary>{c.title}</summary><StoryCardBody c={c} phase={s.phase} fair={!!h?.fair} /></details>)}
    </section>
    {(n || h) && <section class="m-card"><h3>Знания и документы</h3>
      <ul class="list">{(n?.knowledge[player] ?? []).map(k => <li key={k}>{k === 'place' ? 'Знает, где похоронен Сарн' : 'Знает, как соединить сердце'}</li>)}{methods.map(m => <li key={m.id}>{methodLabel(m.id, !!h?.fair)}</li>)}</ul>
      {!(n?.knowledge[player]?.length || methods.length) && <p class="m-note">Знания о месте и способах обряда не открыты.</p>}
      {documents.map(d => <details key={d.id} class="gm-dossier-document"><summary>{d.title}</summary><img src={documentImageUrl(d.id)} alt="" class="gm-document-art" /><p class="m-note"><ItemText>{d.source}</ItemText></p><p class="text story-prose"><ItemText>{d.text}</ItemText></p></details>)}
    </section>}
    {ownStory && <details class="m-card"><summary>Личная история</summary>{ownStory.story.map((t, i) => <p class="text" key={i}><ItemText>{t}</ItemText></p>)}</details>}
    <section class="m-card"><h3>Заявки героя</h3>
      {requests.map(q => <details class="gm-dossier-request" key={q.id}><summary><span>{q.title}<small>{STORY_STATUS[q.status]}</small></span></summary><StoryRequestCard key={q.revision} q={q} v={v} onCard={createGmStoryCard} /></details>)}
      {!requests.length && <p class="m-note">Заявок пока нет.</p>}
    </section>
    {n ? <GmNarrativeGoals v={v} initialPlayer={player} lockedPlayer /> : <section class="m-card"><h3>Личные цели</h3>{(data.hidden17?.roles[player]?.goals ?? role.goals).map((g, i) => <p class="text" key={i}><ItemText>{g}</ItemText></p>)}</section>}
    <details class="gm-fold gm-dossier-correction" ref={correction} open={!!fix}><summary>Исправить ресурсы или эффект</summary><Correction v={v} preset={fix} initialPlayer={player} /></details>
  </div>;
}
