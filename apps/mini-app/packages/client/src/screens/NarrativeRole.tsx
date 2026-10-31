import { ItemText } from '../components/ItemText';
import { documentImageUrl } from '../assets';
import { Thumb } from '../components/Thumb';
import type { PlayerView } from '@fair/shared';
import { Portrait } from '../components/Portrait';
import { Button } from '../components/Button';
import { AbilityCard, IntelCard, UsesCard } from './Role';
import { StoryCards, StoryInvite } from './Story';
import { detailPage, openPage } from '../narrative-navigation';
import { DocumentPage } from './NarrativeBag';
import { BASE } from '../base';

export const EVALUATION_LABEL = { achieved: 'Достигнуто', partial: 'Частично достигнуто', 'not-achieved': 'Не достигнуто' };
export function NarrativeGoals({ v }: { v: PlayerView }) {
 const n=v.hidden17!.narrative!;
 return <section class="m-card narrative-goals"><h5>Ваши стремления</h5>{n.role.goals.map((text,i)=><div key={i}><p class="text"><ItemText>{text}</ItemText></p>{n.evaluations[i] && <p class="m-note"><ItemText><b>{EVALUATION_LABEL[n.evaluations[i].status]}.</b> {n.evaluations[i].note}</ItemText></p>}{!n.evaluations[i] && v.phase==='revealed' && <p class="m-note"><ItemText>Ведущий ещё не оценил эту историю.</ItemText></p>}</div>)}</section>;
}
export function NarrativeRole({ v }: { v: PlayerView }) {
 const r=v.me.role,n=v.hidden17!.narrative!;
 if(detailPage.value?.kind==='document')return <DocumentPage v={v} id={detailPage.value.id}/>;
 return <>
  <header class="narrative-person"><Portrait roleKey={r.key} emoji={r.emoji} size="card" tint/><div><span class="narrative-eyebrow">Ваша роль</span><h2>{r.name}</h2><p><ItemText>{r.title}</ItemText></p></div></header>
  <p class="narrative-private"><ItemText>Личные сведения. Вы сами решаете, кому довериться.</ItemText></p>
  <article class="m-card narrative-story"><h5>Ваша история</h5>{n.role.story.map((p,i)=><p class="text" key={i}><ItemText>{p}</ItemText></p>)}</article>
  <NarrativeGoals v={v}/>
  {n.documents.length>0 && <section class="narrative-documents"><h2 class="scr-h">Письма и свидетельства</h2>{n.documents.map(d=><button class="narrative-document-link" key={d.id} onClick={()=>openPage({kind:'document',id:d.id})}><Thumb src={documentImageUrl(d.id)} emoji="✉" size="sm"/><span><b>{d.title}</b><small>{d.source}</small></span><span aria-hidden="true">›</span></button>)}</section>}
  <AbilityCard v={v}/>
  <StoryCards v={v}/><IntelCard v={v}/><UsesCard v={v}/>
  <section class="m-card"><h5>Рекомендации по отыгрышу</h5>{r.acting.vibe&&<p class="text"><ItemText>{r.acting.vibe}</ItemText></p>}{r.acting.voice&&<p class="text"><ItemText>{r.acting.voice}</ItemText></p>}{r.acting.actions.length>0&&<ul class="list">{r.acting.actions.map(a=><li key={a}><ItemText>{a}</ItemText></li>)}</ul>}{r.acting.lines.length>0&&<p class="m-note"><ItemText>«{r.acting.lines[0]}»</ItemText></p>}</section>
  <StoryInvite/>
  <details class="m-card narrative-rules"><summary>Ярмарка: короткая памятка</summary>{n.rules.map((rule,i)=><div class="narrative-rule" key={i}>{rule.image&&<img src={`${BASE}assets/items/${rule.image.split('/').pop()}`} alt="" loading="lazy"/>}<div><b>{rule.title}</b><p><ItemText>{rule.text}</ItemText></p></div></div>)}</details>
 </>;
}
