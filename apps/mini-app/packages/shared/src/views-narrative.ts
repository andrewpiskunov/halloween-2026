import { KIND_BY_RECIPE } from './engine/shop';
import type { Content } from './content';
import type { GameState } from './types';
import type { PlayerView } from './views';
import type { ItemLore } from './narrative';

/** Только источники героя, добровольно показанное и материальная часть его собственных сделок. */
export function narrativeProjection(state:GameState,content:Content,key:string,base:PlayerView):PlayerView {
 const n=state.hidden17?.narrative, source=content.hidden17?.narrative, hidden=base.hidden17;
 if(!n||!source||!hidden)return base;
 const {gmGoals:_gm,startingItems, ...role}=source.roles[key];
 const knowledge=n.knowledge[key]??[], joining=knowledge.includes('joining');
 const trades=Object.values(n.trades).filter(t=>t.from===key||t.to===key);
 const knownItems={...hidden.knownItems};
 for(const t of trades)for(const [id,item] of Object.entries(t.items))if(!knownItems[id])knownItems[id]=item;
 const knownRefs=new Set(Object.values(knownItems).flatMap(i=>[i.ref,i.kind,`${i.kind}:${i.ref}`]));
 // Базовые материалы и обычные товары известны по мастерской; реликвии — только наблюдавшиеся.
 for(const ref of ['ash','moon','dew','gold']) { knownRefs.add(ref); knownRefs.add(`resource:${ref}`); }
 for(const recipe of base.recipes) { knownRefs.add(recipe.id); knownRefs.add(`${KIND_BY_RECIPE[recipe.id]}:${recipe.id}`); }
 const items:Record<string,ItemLore>=Object.fromEntries(Object.entries(source.items).filter(([id])=>knownRefs.has(id)));
 const ownItems=base.me.items;
 const initialIds=new Set(n.startingItemIds?.[key]??[]);
 const origins:Record<string,string>={};
 const completed=trades.filter(t=>t.status==='completed').sort((a,b)=>(b.closedAt??b.createdAt)-(a.closedAt??a.createdAt)||b.id.localeCompare(a.id));
 for(const item of ownItems){
  const received=completed.find(t=>(t.to===key&&t.give.items.includes(item.id))||(t.from===key&&t.reply?.items.includes(item.id)));
  if(received){const from=received.to===key?received.from:received.to;origins[item.id]=`Получено от участника «${content.roleByKey[from]?.name??from}» в завершённой сделке.`;}
  else if(initialIds.has(item.id)){const origin=startingItems[`${item.kind}:${item.ref}`]??startingItems[item.ref];if(origin)origins[item.id]=origin;}
 }
 const ownResourceRefs=['gold', 'ash', 'moon', 'dew'].filter(ref => (ref === 'gold' ? base.me.player.gold : base.me.player.ingredients[ref as 'ash' | 'moon' | 'dew']) > 0).map(ref=>`resource:${ref}`);
 for(const ref of ownResourceRefs) if(startingItems[ref]) origins[ref]=startingItems[ref];
 const ownStarting=Object.fromEntries(Object.entries(startingItems).filter(([ref])=>ownResourceRefs.includes(ref)||ownItems.some(i=>initialIds.has(i.id)&&(ref===i.ref||ref===`${i.kind}:${i.ref}`))));
 const documents=source.documents.filter(d=>(n.documentAccess[key]??[]).includes(d.id)).map(({holders:_holders,...d})=>d);
 if(joining&&!documents.some(d=>d.knowledge?.includes('joining'))) documents.push({
  id:'memory:joining',title:'Запись услышанного обряда',source:'Вы записали способ, который узнали во время игры',
  text:[...content.hidden17!.ritual.stone, `Формула: «${content.hidden17!.ritual.formula}»`].join('\n\n'),knowledge:['joining'],
 });
 const narrative={role:{...role,startingItems:ownStarting},documents,knowledge,evaluations:state.phase==='revealed'?(n.evaluations[key]??{}):{},trades,announcements:n.announcements,rules:source.rules,craftingRules:source.craftingRules,items,origins};
 const briefing={...hidden.briefing,publicFace:role.story[0]??'',desire:'',secret:'',knowledge:[],firstSteps:[],goals:role.goals,finale:{prepare:'',action:'',choice:'',impact:''},acts:[],backstory:role.story.join('\n\n')};
 const recipes=base.recipes.map(r=>r.id==='focus'?{...r,text:source.items['focus:focus']?.description??'Изделие, удерживающее магическую связь.',lore:source.items['focus:focus']?.uses??'Способ применения нужно узнать в игре.'}:r);
 return {...base, recipes, hidden17:{...hidden,knownItems,briefing,narrative,publicRules:[],board:[],dice:[],rumors:[],ritual:{...hidden.ritual,stone:joining?hidden.ritual.stone:[],formula:joining?hidden.ritual.formula:'',...(hidden.ritual.outcome?{outcome:{...hidden.ritual.outcome,goals:{}}}:{})}},me:{...base.me,goals:[],role:{...base.me.role,intro:role.story[0]??'',backstory:role.story.join('\n\n'),goals:role.goals,secret:'',motivation:''}},offers:[],offerItems:{},public:{...base.public,relics:[],story:'Ярмарка украденной магии'}};
}
