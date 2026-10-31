import { useState } from 'preact/hooks';
import type { GmView } from '@fair/shared';
import { Button } from '../../components/Button';
import { ItemText } from '../../components/ItemText';
import { Select } from '../../components/Select';
import { readyAdmissions, validAdmission } from '../../rules';
import { mmss } from '../../labels';
import { ask, gmTab, loadedContent, now, run } from '../../store';
const who=(key:string)=>loadedContent().roles.find(r=>r.key===key)?.name??key;
const time=(at:number)=>new Date(at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
export function FairConsole({v}:{v:GmView}) {
 const {state}=v,h=state.hidden17!,fair=h.fair!;
 const running=['act1','act2','act3'].includes(state.phase),paused=state.clock.pausedAt!==undefined;
 const live=running&&!paused&&h.ritual.step==='preparation';
 const refreshBlocked=Object.values(state.requests).some(q=>q.status==='pending')||Object.values(h.production).some(q=>q.status==='pending'&&q.ability);
 const unfinishedScenes=Object.values(fair.destruction).some(s=>['pending','active'].includes(s.status));
 const elapsed=Math.max(0,(state.clock.pausedAt??now.value)-state.clock.actStartedAt-state.clock.pausedTotal);
 return <><div class="m-card clock"><div class="act">{running?'Ярмарка':state.phase==='setup'?'Подготовка':'Эпилог'}</div><div class="big" role="timer">{running?mmss(elapsed):'00:00'}</div><p>{paused?'Пауза. Отсчёт остановлен.':'События проводятся по решению ведущего.'}</p></div>
  <div class="ctl"><Button kind="sec" disabled={!running} onClick={()=>void run({type:paused?'clock.resume':'clock.pause'})}>{paused?'Продолжить':'Пауза'}</Button><Button kind="sec" onClick={()=>{gmTab.value='ritual';}}>Закрытый обряд</Button></div>
  <section class="m-card"><h5>События ярмарки</h5><p class="m-note">Обновление сил и пополнение мастерской независимы. Каждое доступно два раза за вечер.</p>
   <Button disabled={!live||fair.refreshes>=2||refreshBlocked} onClick={()=>ask({title:'Обновить силы?',text:'Применения способностей и авторских изделий станут доступны снова. Временные эффекты закончатся. Сначала завершите или отмените все запросы согласия и заказы со способностью.',okLabel:'Обновить силы',onOk:()=>void run({type:'fair.refresh'})})}>Обновить силы · {fair.refreshes}/2</Button>
   {refreshBlocked&&<p class="m-note">Для обновления сил сначала завершите или отмените запросы согласия и заказы со способностью.</p>}
   <Button disabled={!live||fair.resupplies>=2} onClick={()=>ask({title:'Пополнить мастерскую?',text:'В мастерскую поступит очередная порция материалов.',okLabel:'Пополнить',onOk:()=>void run({type:'fair.resupply'})})}>Пополнить мастерскую · {fair.resupplies}/2</Button>
   <Button disabled={!live||fair.auctionReleased} onClick={()=>ask({title:'Объявить аукцион?',text:'На торг выйдет Осколок IV вместе с уликой A.',okLabel:'Выпустить лот',onOk:()=>void run({type:'fair.auction'})})}>{fair.auctionReleased?'Аукцион объявлен':'Объявить аукцион Осколка IV'}</Button>
   <Button kind="sec" disabled={!live||unfinishedScenes} onClick={()=>ask({title:'Закончить вечер без обряда?',text:'Если уничтожены три части сердца, оно погибнет. Иначе останется спящим. После этого можно перейти к личным эпилогам.',okLabel:'Завершить без обряда',onOk:()=>void run({type:'fair.finish'})})}>Закончить без обряда</Button>
   {unfinishedScenes&&<p class="m-note">Перед завершением вечера разрешите все открытые сцены с осколками.</p>}
   {h.ritual.outcome&&<Button onClick={()=>{gmTab.value='results';}}>К исходу и эпилогам</Button>}
  </section><GmDestructionScenes v={v}/></>;
}
export function FairAdmissions({v}:{v:GmView}) {
 const fair=v.state.hidden17!.fair!,sealed=v.state.hidden17!.ritual.step!=='preparation';
 const [player,setPlayer]=useState(''),[requestId,setRequest]=useState(''),[arrival,setArrival]=useState('');
 const requests=Object.values(v.state.story?.requests??{}).filter(q=>q.author===player&&!['cancelled','rejected'].includes(q.status));
 const selected=requests.some(q=>q.id===requestId)?requestId:requests[0]?.id??'';
 const arrivalAt=arrival?new Date(arrival).getTime():now.value;
 const due=readyAdmissions(v,now.value);
 return <section class="m-card"><h5>{sealed?'Замкнутый круг':'Допуски к закрытому обряду'}</h5><p class="text"><ItemText>{sealed?'Состав зафиксирован при начале сцены. Позднего входа и передачи вещей внутрь нет.':'Оформляйте допуск только по собственной заявке каждого героя. Проверьте текст, место и время прибытия. При старте войдут присутствующие, время которых уже наступило.'}</ItemText></p>
  {sealed?<p class="text">Участники: {(fair.participants??[]).map(who).join(', ')||'никого'}.</p>:<>
   <Select label="Герой для допуска" value={player} onChange={s=>{setPlayer(s);setRequest('');}} options={v.state.roster.map(key=>({value:key,label:who(key),avatar:key}))}/>
   {player&&<><Select label="Личная заявка для допуска" value={selected} onChange={setRequest} options={requests.map(q=>({value:q.id,label:q.title}))}/>{selected&&<p class="text story-prose"><ItemText>{requests.find(q=>q.id===selected)?.text}</ItemText></p>}{!requests.length&&<p class="m-note">У героя нет подходящей личной заявки.</p>}<label class="field"><span>Время прибытия (пусто — сейчас)</span><input type="datetime-local" value={arrival} onInput={e=>setArrival(e.currentTarget.value)}/></label><Button disabled={!selected||!Number.isFinite(arrivalAt)||!v.state.players[player]?.present} onClick={()=>ask({title:`Допустить ${who(player)}?`,text:`Прибытие: ${time(arrivalAt)}. Основание: ${requests.find(q=>q.id===selected)?.title}.`,okLabel:'Зафиксировать допуск',onOk:()=>void run({type:'fair.admit',player,requestId:selected,at:arrivalAt})})}>Зафиксировать допуск</Button></>}
   <p class="text"><b>Войдут при старте сейчас:</b> {due.map(who).join(', ')||'никого'}.</p>
   {Object.entries(fair.admissions).map(([key,a])=><div class="m-row" key={key}><span><b>{who(key)}</b> · {time(a.at)}{!validAdmission(v.state,key)?' · допуск недействителен':!v.state.players[key]?.present?' · отсутствует':a.at>now.value?' · ещё не прибыл':' · готов'}<small>{v.state.story?.requests[a.requestId]?.title}</small></span><Button small kind="sec" onClick={()=>void run({type:'fair.admission.remove',player:key})}>Снять допуск</Button></div>)}
  </>}
 </section>;
}
export function GmDestructionScenes({v}:{v:GmView}) {
 const h=v.state.hidden17!,scenes=Object.values(h.fair!.destruction);
 const current=v.state.clock.pausedAt??now.value;
 if(!scenes.length)return null;
 return <section><h2 class="scr-h">Разрушение осколков</h2>{[...scenes].reverse().map(s=>{
  const left=Math.max(0,(s.endsAt??current)-current);
  return <div class="m-card" key={s.id}><h5>Осколок {s.ref} · {who(s.author)}</h5><p class="text">{s.status==='pending'?'Заявка: соль в резерве':s.status==='active'?`Окно спасения: ${mmss(left)}`:s.status==='destroyed'?'Осколок уничтожен':s.status==='saved'?`Спасён талисманом: ${who(s.wardBy??'')}`:'Попытка отменена'}</p>
   {s.status==='pending'&&<Button disabled={h.ritual.step!=='preparation'||v.state.clock.pausedAt!==undefined} onClick={()=>ask({title:`Объявить разрушение Осколка ${s.ref}?`,text:'Соль будет потрачена. Откроется двухминутное окно спасения для присутствующих героев.',okLabel:'Объявить сцену',onOk:()=>void run({type:'fair.destroy.start',id:s.id})})}>Объявить сцену · 2 минуты</Button>}
   {['pending','active'].includes(s.status)&&<Button kind="sec" onClick={()=>ask({title:'Отменить попытку?',text:s.status==='pending'?'Резерв соли вернётся автору.':'Потраченная соль не вернётся.',okLabel:'Отменить',onOk:()=>void run({type:'fair.destroy.cancel',id:s.id})})}>Отменить сцену</Button>}
   {s.status==='active'&&<Button disabled={left>0||v.state.clock.pausedAt!==undefined} onClick={()=>ask({title:`Подтвердить уничтожение Осколка ${s.ref}?`,text:'Окно спасения завершено. Осколок исчезнет навсегда; отменить это действие нельзя.',okLabel:'Подтвердить уничтожение',danger:true,onOk:()=>void run({type:'fair.destroy.resolve',id:s.id})})}>Подтвердить после окна</Button>}
  </div>;
 })}</section>;
}

/** Старый журнал переводится явно; начатый финал сохраняет прежние правила. */
export function FairMigration({v}:{v:GmView}) {
 const h=v.state.hidden17;
 if(!h||h.fair)return null;
 const canEnable=h.ritual.step==='preparation'&&!['closed','revealed'].includes(v.state.phase);
 return <section class="m-card"><h5>Непрерывная ярмарка</h5><p class="text">События ведущего без переходов между актами, кровь донора, отдельные сцены разрушения и закрытый состав обряда. Инвентарь и журнал сохраняются.</p><Button disabled={!canEnable} onClick={()=>ask({title:'Включить непрерывную ярмарку?',text:'Новые правила начнут действовать в этой партии. Уже использованные обновления сил и поставки сохранятся в общем лимите двух за вечер.',okLabel:'Включить новые правила',onOk:()=>void run({type:'fair.enable'})})}>Включить непрерывную ярмарку</Button>{!canEnable&&<p class="m-note">Начатый финал завершается по прежним правилам.</p>}</section>;
}
