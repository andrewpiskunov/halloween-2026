import { useState } from 'preact/hooks';
import type { DestructionScene, HiddenMethod, Item, PlayerView } from '@fair/shared';
import { Button } from '../components/Button';
import { ItemText } from '../components/ItemText';
import { Select } from '../components/Select';
import { itemImageUrl } from '../assets';
import { mmss, roleName } from '../labels';
import { ask, now, run } from '../store';
import { methodLabel, specialLabel } from './HiddenCommon';

export function FairPreparation({ v }: { v: PlayerView }) {
 const h=v.hidden17!;
 const [chosen,setChosen]=useState<HiddenMethod>(h.knownMethods[0]??'salt');
 const [itemId,setItem]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const method=h.knownMethods.includes(chosen)?chosen:h.knownMethods[0]??'salt';
 if(!h.knownMethods.length||h.ritual.step!=='preparation')return null;
 const source=v.me.items.filter(i=>v.me.available.items.includes(i.id)&&i.kind===(method==='sign'?'focus':'potion'));
 const selected=source.some(i=>i.id===itemId)?itemId:source[0]?.id??'';
 const title=method==='sign'?'Наполнить бутылёк своей кровью':method==='salt'?'Приготовить разрывную соль':'Подготовить отводящий сосуд';
 const prepare=()=>ask({title:`${title}?`,text:method==='sign'?'Один Фокус силы будет израсходован. Донором останетесь вы, даже если передадите бутылёк. При успешной привязке вы сможете произнести одно устное распоряжение до рассвета.':`Одно Очищающее зелье будет израсходовано. ${methodLabel(method,true)} появится в сумке.`,okLabel:'Подготовить',onOk:async()=>{
  setBusy(true);setMessage('');try{const result=await run({type:'hidden17.prepare',method,itemId:selected});if(result.ok){setItem('');setMessage(`${methodLabel(method,true)} готов. Он находится в вашей сумке.`);}}finally{setBusy(false);}
 }});
 return <section class="m-card ritual-preparation"><h3>Личная подготовка</h3><p class="m-note">Здесь доступны только способы, которые вы узнали в игре.</p>
  {h.knownMethods.length>1&&<Select label="Способ подготовки" value={method} onChange={s=>{setChosen(s as HiddenMethod);setItem('');setMessage('');}} options={h.knownMethods.map(m=>({value:m,label:methodLabel(m,true)}))}/>}
  <h4>{title}</h4>{method==='sign'&&<p class="text"><ItemText>Кровь свяжет вас с сердцем. Защитный талисман может оборвать связь; кровь разных доноров срывает все привязки. Несколько ваших бутылей дают всё равно одно распоряжение.</ItemText></p>}
  {h.methods.filter(m=>m.id===(method==='sign'?'command':method==='salt'?'salt':'vessel')).map(m=><details key={m.id}><summary>Известный вам способ</summary><p class="text"><ItemText>{m.private}</ItemText></p></details>)}
  {source.length>0?<><Select label="Сырьё для подготовки" value={selected} onChange={setItem} disabled={busy} options={source.map(i=>({value:i.id,label:specialLabel(i,v),image:itemImageUrl(i)}))}/><Button disabled={busy||!selected||v.clock.paused} onClick={prepare}>{busy?'Подготавливаем…':title}</Button></>:<p class="text"><ItemText>Для подготовки нужен свободный {method==='sign'?'Фокус силы':'Очищающее зелье'}. Его можно заказать в мастерской.</ItemText></p>}
  {message&&<p class="text" role="status"><ItemText>{message}</ItemText></p>}
 </section>;
}

export function DestroyShard({v,item}:{v:PlayerView;item:Item}) {
 const h=v.hidden17!,fair=h.fair!;const [saltId,setSalt]=useState('');
 const salts=v.me.items.filter(i=>h.prepared[i.id]?.method==='salt'&&v.me.available.items.includes(i.id));
 const selected=salts.some(i=>i.id===saltId)?saltId:salts[0]?.id??'';
 const scenes=fair.scenes.filter(s=>s.targetId===item.id&&['pending','active'].includes(s.status));
 if(h.ritual.step!=='preparation'||h.ritual.extinguished.includes(item.ref))return null;
 return <>
  {scenes.map(s=><DestructionCard key={s.id} v={v} scene={s}/>)}
  {!scenes.length&&salts.length>0&&<section class="m-card"><h5>Погасить свой осколок</h5><p class="text"><ItemText>Выберите подготовленную Разрывную соль. Ведущий объявит сцену и откроет две минуты, в течение которых осколок можно спасти Защитным талисманом. Уничтожение необратимо.</ItemText></p><Select label="Соль для разрушения" value={selected} onChange={setSalt} options={salts.map(i=>({value:i.id,label:specialLabel(i,v),image:itemImageUrl(i)}))}/><Button disabled={!v.me.available.items.includes(item.id)||!selected||v.clock.paused} onClick={()=>ask({title:`Попытаться уничтожить Осколок ${item.ref}?`,text:'До объявления сцены соль будет зарезервирована. Если отменить заявку до начала, она вернётся.',okLabel:'Попросить сцену',onOk:()=>void run({type:'fair.destroy.request',itemId:item.id,saltId:selected})})}>Попросить сцену разрушения</Button></section>}
 </>;
}

const SCENE_STATUS:Record<DestructionScene['status'],string>={pending:'Ждёт объявления ведущего',active:'Окно спасения',saved:'Осколок спасён',cancelled:'Попытка отменена',destroyed:'Осколок уничтожен'};
export function DestructionCard({v,scene:s}:{v:PlayerView;scene:DestructionScene}) {
 const [ward,setWard]=useState('');const me=v.me.role.key;
 const wards=v.me.items.filter(i=>i.kind==='ward'&&v.me.available.items.includes(i.id));
 const id=wards.some(i=>i.id===ward)?ward:wards[0]?.id??'';
 const current=v.clock.paused?v.clock.pausedAt??now.value:now.value;
 const left=s.endsAt===undefined?0:Math.max(0,s.endsAt-current);
 const eligible=v.me.player.present&&(!s.participants||s.participants.includes(me));
 const cancel=s.author===me&&['pending','active'].includes(s.status);
 return <section class={`m-card ${s.status==='active'?'hot':''}`}><h5>Осколок {s.ref} · {SCENE_STATUS[s.status]}</h5><p class="text">{roleName(s.author,v)} {['pending','active'].includes(s.status)?'пытается':'пытался'} погасить свою часть сердца.</p>
  {s.status==='active'&&<><p class="text" role="timer">{left>0?`Можно спасти: ${mmss(left)}`:'Окно истекло. Ожидаем решения ведущего.'}{v.clock.paused?' · пауза':''}</p><p class="m-note">Соль уже потрачена. Только первый талисман будет израсходован.</p></>}
  {s.wardBy&&<p class="text">Осколок спасён: {roleName(s.wardBy,v)}.</p>}
  {cancel&&<Button kind="sec" onClick={()=>ask({title:s.status==='pending'?'Отозвать заявку?':'Остановить свою попытку?',text:s.status==='pending'?'Резерв соли вернётся в сумку.':'Осколок останется целым. Потраченная соль не вернётся.',okLabel:'Отказаться',onOk:()=>void run({type:'fair.destroy.cancel',id:s.id})})}>{s.status==='pending'?'Отозвать заявку':'Отказаться от разрушения'}</Button>}
  {s.status==='active'&&left>0&&eligible&&<><Select label={`Талисман для спасения Осколка ${s.ref}`} value={id} onChange={setWard} options={wards.map(i=>({value:i.id,label:'Защитный талисман',image:itemImageUrl(i)}))}/><Button disabled={!id||v.clock.paused} onClick={()=>ask({title:`Спасти Осколок ${s.ref}?`,text:'Один Защитный талисман будет израсходован, если вы первым остановите эту попытку.',okLabel:'Спасти осколок',onOk:()=>void run({type:'fair.destroy.ward',id:s.id,itemId:id})})}>Спасти талисманом</Button></>}
 </section>;
}
export function FairScenes({v}:{v:PlayerView}) {
 const scenes=v.hidden17?.fair?.scenes??[];
 return scenes.length?<section><h2 class="scr-h">Сцены ярмарки</h2>{[...scenes].reverse().map(s=><DestructionCard key={s.id} scene={s} v={v}/>)}</section>:null;
}
