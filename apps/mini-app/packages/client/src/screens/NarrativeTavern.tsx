import { LotCard } from './Events';
import { useState } from 'preact/hooks';
import type { PlayerView } from '@fair/shared';
import { BASE } from '../base';
import { Button } from '../components/Button';
import { Portrait } from '../components/Portrait';
import { Frozen } from '../components/Frozen';
import { roleName } from '../labels';
import { run, showToast } from '../store';
import { PlayerStory, StoryText } from './Story';
export function NarrativeTavern({v}:{v:PlayerView}){
 const n=v.hidden17!.narrative!;const [compose,setCompose]=useState(false),[title,setTitle]=useState(''),[text,setText]=useState(''),[busy,setBusy]=useState(false);
 const announcements=[...v.announcements.map((a,i)=>({...a,id:`gm-${i}`,author:'gm'})),...n.announcements].sort((a,b)=>b.at-a.at);
 const publish=async()=>{setBusy(true);try{const r=await run({type:'narrative.announce',title:title.trim(),text:text.trim()});if(r.ok){setTitle('');setText('');setCompose(false);showToast('Объявление на доске');}}finally{setBusy(false);}};
 return <><header class="narrative-scene"><img src={`${BASE}assets/scenes/tavern.webp`} alt="Тёплая таверна с доской объявлений у входа"/><div><span class="narrative-eyebrow">Главная площадь ярмарки</span><h2>Таверна</h2></div></header>
 <section class="narrative-board"><div class="narrative-section-head"><h2 class="scr-h">Объявления</h2><button class="narrative-back" onClick={()=>setCompose(!compose)}>{compose?'Закрыть':'+ Написать'}</button></div>
 {compose&&<div class="m-card"><h5>Ваше объявление</h5><StoryText label="Заголовок объявления" value={title} onChange={setTitle} max={100} small/><StoryText label="Текст объявления" value={text} onChange={setText} max={1000}/><p class="m-note">Видят все. Можно искать вещь, предлагать работу или обещать награду. Передачу награды оформите сделкой, когда договоритесь.</p><Button disabled={busy||!title.trim()||!text.trim()} onClick={()=>void publish()}>Повесить объявление</Button></div>}
 {announcements.map(a=><article class="m-card narrative-announcement" key={a.id}><div class="item">{a.author!=='gm'&&<Portrait roleKey={a.author} emoji="☉" size="sm"/>}<div><small>{a.author==='gm'?'Ведущий':roleName(a.author,v)} · {new Date(a.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small><h3>{a.title}</h3></div></div><p class="text story-prose">{a.text}</p></article>)}
 {!announcements.length&&<p class="m-note">На доске пока нет объявлений. Оставьте первое.</p>}
 </section>{v.lots.length>0&&<section class="m-card"><h5>Торг на ярмарке</h5>{v.lots.map(l=><LotCard key={l.id} l={l} v={v}/>)}</section>}<p class="narrative-place-note">В самой таверне тоже есть доска: оставляйте бумажные записки и встречайтесь у неё. За столами можно сыграть настоящими кубиками — о ставке договоритесь до броска.</p>
 <Frozen.Provider value={false}><PlayerStory v={v}/></Frozen.Provider>
 </>;
}
