import { useState } from 'preact/hooks';
import type { Item, PlayerView } from '@fair/shared';
import { BASE } from '../base';
import { itemImageUrl, resourceImageUrl } from '../assets';
import { Button } from '../components/Button';
import { Frozen, frozenReason } from '../components/Frozen';
import { Select } from '../components/Select';
import { Thumb } from '../components/Thumb';
import { INGREDIENTS, clueText, marksText, roleName } from '../labels';
import { canUseItem, canOffer } from '../rules';
import { ask, run, tradeDraft } from '../store';
import { detailPage, openPage, closePage, navigateTab } from '../narrative-navigation';
import { UseChoice } from './Bag';
import { people, specialLabel } from './HiddenCommon';
import { SignatureGoods, SignatureUse } from './SignatureGoods';
import { StoryCards } from './Story';

export function PageBack(){return <button class="narrative-back" onClick={closePage}>← Назад</button>;}
export function MissingPage(){return <><PageBack/><div class="m-card"><h5>Эта страница недоступна</h5><p class="text">Вещь передана, документ отозван или у вас пока нет этих сведений.</p></div></>;}
export function DocumentPage({v,id}:{v:PlayerView;id:string}){
 const d=v.hidden17!.narrative!.documents.find(d=>d.id===id);const [player,setPlayer]=useState('');
 if(!d)return <MissingPage/>;
 const mine=v.hidden17!.narrative!.role.documents.includes(id);
 return <><PageBack/><article class="m-card narrative-letter"><header class="narrative-letter-header"><h2>{d.title}</h2><span class="narrative-letter-seal" aria-hidden="true">✉</span></header><p class="m-note">{d.source}</p><div class="narrative-letter-text">{d.text}</div></article>{mine&&<section class="m-card"><h5>Показать документ</h5><p class="text">Этот герой прочитает весь текст и узнает описанные в нём способы. Вы сами решаете, кому доверять.</p><Select label="Кому показать документ" value={player} onChange={setPlayer} options={people(v,false)}/><div class="m-btns"><Button disabled={!player} onClick={()=>ask({title:'Показать личный документ?',text:`${roleName(player,v)} увидит «${d.title}». Прочитанное знание останется у него даже после отзыва.`,okLabel:'Показать',onOk:()=>void run({type:'narrative.document.show',documentId:id,player,allow:true})})}>Показать</Button><Button kind="sec" disabled={!player} onClick={()=>void run({type:'narrative.document.show',documentId:id,player,allow:false})}>Забрать документ</Button></div></section>}</>;
}
function PresentItem({v,item}:{v:PlayerView;item:Item}){
 const [player,setPlayer]=useState('');
 return <section class="m-card"><h5>Показать вещь</h5><p class="text">Покажите «{specialLabel(item,v)}» выбранному герою. Вещь остаётся у вас; ваша личная история не раскрывается.</p><Select label="Кому показать вещь" value={player} onChange={setPlayer} options={people(v,false)}/><div class="m-btns"><Button disabled={!player} onClick={()=>void run({type:'hidden17.present',itemId:item.id,player,allow:true})}>Показать</Button><Button kind="sec" disabled={!player} onClick={()=>void run({type:'hidden17.present',itemId:item.id,player,allow:false})}>Убрать вещь</Button></div></section>;
}
function ShardAccess({v,item}:{v:PlayerView;item:Item}){
 const [player,setPlayer]=useState('');
 return <details class="m-card"><summary>Позволить коснуться части сердца</summary><p class="text">Позвольте выбранному герою провести над этой частью свой обряд. Последствия могут быть необратимыми. Обычный показ вещи такого разрешения не даёт.</p><Select label="Кому разрешить обряд над частью" value={player} onChange={setPlayer} options={people(v,false)}/><div class="m-btns"><Button disabled={!player} onClick={()=>ask({title:'Разрешить обряд над вашей частью?',text:`${roleName(player,v)} получит доступ к «${specialLabel(item,v)}» вне общего круга.`,okLabel:'Разрешить',onOk:()=>void run({type:'hidden17.ritual.permission',itemId:item.id,player,allow:true})})}>Разрешить</Button><Button kind="sec" disabled={!player} onClick={()=>void run({type:'hidden17.ritual.permission',itemId:item.id,player,allow:false})}>Отозвать</Button></div><p class="m-note">Сейчас разрешено: {(v.hidden17!.ritual.permissions[item.id]??[]).map(k=>roleName(k,v)).join(', ')||'никому'}.</p></details>;
}
export function ResourcePage({v,id}:{v:PlayerView;id:string}){
 if(!['gold','ash','moon','dew'].includes(id))return <MissingPage/>;
 const key=id as 'gold'|'ash'|'moon'|'dew';const n=v.hidden17!.narrative!;const lore=n.items[id]??n.items[`resource:${id}`];
 const name=key==='gold'?'Золото':INGREDIENTS.find(i=>i.key===key)!.name;
 const count=key==='gold'?v.me.available.gold:v.me.available.ingredients[key];const total=key==='gold'?v.me.player.gold:v.me.player.ingredients[key];
 return <><PageBack/><article class="m-card narrative-object"><img class="narrative-object-art" src={resourceImageUrl(key)} alt={name}/><h2>{name}</h2><div class="narrative-quantity"><b>{count}</b> доступно{total!==count&&<small>Ещё {total-count} обещано</small>}</div><p class="text">{lore?.description??'Ресурс ярмарки. Вы можете предложить его другому герою в сделке.'}</p>{lore?.history&&<p class="text">{lore.history}</p>}{n.origins[`resource:${id}`]&&<div class="narrative-provenance"><h5>Из ваших запасов</h5><p class="text">{n.origins[`resource:${id}`]}</p><small>Личная история, видна только вам.</small></div>}<h5>Что можно сделать</h5><p class="text">{lore?.uses??(key==='gold'?'Оплатить работу мастера, купить материалы или договориться с другим героем.':'Принести мастеру для заказа, обменять или продать в мастерскую.')}</p><div class="m-btns"><Frozen.Provider value={false}><Button kind="sec" onClick={()=>navigateTab('trades')}>Предложить в сделке</Button>{key!=='gold'&&<Button kind="sec" onClick={()=>{navigateTab('workshop');openPage({kind:'resource',id});}}>Купить или продать</Button>}</Frozen.Provider></div><p class="m-note">О ресурсе можно рассказать собеседнику; личную историю своего запаса раскрывайте по желанию.</p></article></>;
}
function ItemPage({v,id}:{v:PlayerView;id:string}){
 const [using,setUsing]=useState(false);const n=v.hidden17!.narrative!;
 const item=v.me.items.find(i=>i.id===id);const shown=v.hidden17!.knownItems[id];const it=item??shown;
 if(!it)return <MissingPage/>;
 const title=specialLabel(it,v),lore=n.items[`${it.kind}:${it.ref}`]??n.items[it.ref]??n.items[it.kind];
 const use=item?canUseItem(item,v):null;const art=itemImageUrl(it);
 return <><PageBack/><article class="m-card narrative-object">{art?<img class="narrative-object-art" src={art} alt={title}/>:<div class="narrative-object-symbol" aria-hidden="true">✦</div>}<p class="narrative-eyebrow">{item?'В вашей сумке':'Вам показали'}</p><h2>{title}</h2><p class="text">{lore?.description??clueText(it as Item,v)??'Необычная вещь. Узнайте её историю у владельца.'}</p>{lore?.history&&<p class="text">{lore.history}</p>}{item&&n.origins[id]&&<div class="narrative-provenance"><h5>Как вещь оказалась у вас</h5><p class="text">{n.origins[id]}</p><small>Эту историю видите только вы.</small></div>}{lore?.uses&&<><h5>Что можно сделать</h5><p class="text">{lore.uses}</p></>}{item?.reservedFor&&<p class="ab-state">Вещь обещана до завершения действия.</p>}{item&&<div class="m-btns"><Button kind="sec" disabled={!canOffer(item,v)} onClick={()=>{tradeDraft.value={itemId:id};navigateTab('trades');}}>Предложить в сделке</Button>{['potion','ward','shape'].includes(item.kind)&&<Button disabled={!use?.ok} onClick={()=>item.kind==='ward'?ask({title:'Активировать защитный талисман?',text:'Он исчезнет и защитит вас до конца акта.',okLabel:'Активировать',onOk:()=>void run({type:'item.use',itemId:id})}):setUsing(!using)}>Использовать</Button>}</div>}{using&&item&&use?.ok&&<UseChoice v={v} item={item} onDone={()=>setUsing(false)}/>}</article>
 {item&&v.hidden17!.ritual.step==='preparation'&&<PresentItem v={v} item={item}/>}
 {item?.kind==='special'&&['shape-fixative','inspection-lens','herbal-incense'].includes(item.ref)&&<SignatureUse item={item} v={v}/>}
 {item?.kind==='shard'&&(n.knowledge.includes('place')||v.hidden17!.ritual.step!=='preparation')&&['preparation','assembly','powder','choices'].includes(v.hidden17!.ritual.step)&&<Frozen.Provider value={frozenReason(v) || (v.clock.paused ? 'Игра на паузе' : false)}><ShardAccess item={item} v={v}/></Frozen.Provider>}
 </>;
}
export function NarrativeBag({v}:{v:PlayerView}){
 const page=detailPage.value;if(page?.kind==='item')return <ItemPage key={page.id} v={v} id={page.id}/>;if(page?.kind==='resource')return <ResourcePage v={v} id={page.id}/>;if(page?.kind==='document')return <DocumentPage key={page.id} v={v} id={page.id}/>;
 const marks=marksText(v),n=v.hidden17!.narrative!;
 const shown=Object.entries(v.hidden17!.knownItems).filter(([id,i])=>!v.me.items.some(it=>it.id===id)&&i.owner&&i.owner!==v.me.role.key);
 return <><h2 class="scr-h">Ваша сумка <small>нажмите на вещь</small></h2><div class="narrative-satchel" style={{backgroundImage:`url(${BASE}assets/scenes/bag.webp)`}}><div class="narrative-inventory">
 {(['gold','ash','moon','dew'] as const).map(key=><button class="narrative-slot" key={key} onClick={()=>openPage({kind:'resource',id:key})}><img src={resourceImageUrl(key)} alt=""/><b>{key==='gold'?v.me.available.gold:v.me.available.ingredients[key]}</b><span>{key==='gold'?'Золото':INGREDIENTS.find(i=>i.key===key)!.name}</span></button>)}
 {v.me.items.map(item=><button class={`narrative-slot ${item.reservedFor?'reserved':''}`} key={item.id} onClick={()=>openPage({kind:'item',id:item.id})}><Thumb src={itemImageUrl(item)} emoji="✦" size="md"/><span>{specialLabel(item,v)}</span>{item.reservedFor&&<small>обещано</small>}</button>)}
 </div></div><p class="m-note">Показано доступное. Обещанные вещи и материалы ждут завершения сделки; подробности — внутри.</p>
 <StoryCards v={v} items/>
 {shown.length>0&&<section class="m-card"><h5>Вам показали</h5>{shown.map(([id,it])=><button class="narrative-document-link" key={id} onClick={()=>openPage({kind:'item',id})}><Thumb src={itemImageUrl(it)} emoji="✦" size="sm"/><span>{specialLabel(it,v)}<small>{it.owner&&roleName(it.owner,v)}</small></span><span>›</span></button>)}</section>}
 {n.documents.length>0&&<section class="m-card"><h5>Письма и свидетельства</h5>{n.documents.map(d=><button class="narrative-document-link" key={d.id} onClick={()=>openPage({kind:'document',id:d.id})}><span>✉</span><span>{d.title}</span><span>›</span></button>)}</section>}
 <SignatureGoods v={v} historyOnly/>{marks.length>0&&<div class="m-card"><h5>На вас действует</h5>{marks.map(m=><div class="m-row" key={m.label}><span>{m.label}</span><b>{m.value}</b></div>)}</div>}
 </>;
}
