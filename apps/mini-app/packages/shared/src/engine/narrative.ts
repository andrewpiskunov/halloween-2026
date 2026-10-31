import type { Content } from '../content';
import type { Command, Ctx } from '../commands';
import type { Event } from '../events';
import type { Bundle, GameState, TradeSide } from '../types';
import type { NarrativeCommand, NarrativeContent, NarrativeState, NarrativeTrade } from '../narrative';
import { available, hasBundle, INGREDIENTS, isTradable, transfer } from './bundles';
import { fail, ok, type Result, type ErrorCode } from './result';
import { lookup } from './guards';

class Invalid extends Error { constructor(public code: ErrorCode, detail: string) { super(detail); } }
function need(v: unknown, detail: string, code: ErrorCode = 'invalid'): asserts v { if (!v) throw new Invalid(code, detail); }
const text = (s: unknown, max: number, empty = false) => need(typeof s === 'string' && s.length <= max && (empty || !!s.trim()), 'Некорректный текст');
export const activeTrade = (t: NarrativeTrade) => t.status === 'offered' || t.status === 'replied';
export function newNarrative(source: NarrativeContent): NarrativeState {
 const knowledge: NarrativeState['knowledge'] = {}, documentAccess: NarrativeState['documentAccess'] = {};
 for (const key of Object.keys(source.roles)) { const docs = source.documents.filter(d=>d.holders.includes(key)); documentAccess[key] = docs.map(d=>d.id); knowledge[key] = [...new Set(docs.flatMap(d=>d.knowledge??[]))]; }
 return {version:2,knowledge,documentAccess,evaluations:{},trades:{},announcements:[]};
}
function reserve(s:GameState,key:string,b:Bundle,id:string,direction:1|-1) {
 s.players[key].reservedGold += direction*b.gold;
 for(const item of b.items) { if(direction===1)s.items[item].reservedFor=id;else if(s.items[item]?.reservedFor===id)delete s.items[item].reservedFor; }
}
export function closeNarrativeTrade(s:GameState,t:NarrativeTrade,status:'cancelled'|'declined'|'expired'|'completed',at:number) {
 reserve(s,t.from,t.give,t.id,-1);if(t.reply)reserve(s,t.to,t.reply,t.id,-1);t.status=status;t.closedAt=at;
}
function validateBundle(s:GameState,key:string,b:Bundle) {
 need(b && typeof b==='object' && Number.isSafeInteger(b.gold) && b.gold>=0 && b.ingredients && Array.isArray(b.items),'Некорректный набор');
 need(INGREDIENTS.every(k=>Number.isSafeInteger(b.ingredients[k])&&b.ingredients[k]>=0),'Некорректные количества');
 need(b.items.length<=100 && b.items.every(id=>typeof id==='string') && new Set(b.items).size===b.items.length && !b.wants?.length && !b.rumor,'Только собственные материальные вещи');
 need(b.items.every(id=>isTradable(s,id,s.phase) && s.items[id].owner.type==='player' && s.items[id].owner.key===key),'Нужны собственные доступные вещи','not_owner');
 need(hasBundle(s,key,b),'Ресурсы недоступны или обещаны','reserved');
}
const metadata = (s:GameState,b:Bundle) => Object.fromEntries(b.items.map(id=>[id,{kind:s.items[id].kind,ref:s.items[id].ref}]));
const side = (s:GameState,b:Bundle):TradeSide => ({gold:b.gold,ingredients:{...b.ingredients},items:b.items.map(id=>({kind:s.items[id].kind,ref:s.items[id].ref,...(s.items[id].createdBy?{createdBy:s.items[id].createdBy}:{})}))});
function stillReserved(s:GameState,t:NarrativeTrade,key:string,b:Bundle) { const p=s.players[key];return p?.present && p.gold>=b.gold && INGREDIENTS.every(k=>p.ingredients[k]>=b.ingredients[k]) && b.items.every(id=>s.items[id]?.reservedFor===t.id && s.items[id].owner.type==='player' && s.items[id].owner.key===key); }
function migrate(s:GameState,content:Content,now:number) {
 const h=s.hidden17!;need(h.ritual.step==='preparation'&&!['closed','revealed'].includes(s.phase),'Начатый финал нужно завершить в прежней редакции','phase');
 need(!Object.values(h.dice).some(d=>d.status==='started'),'Сначала завершите начатые броски','phase');
 for(const o of Object.values(s.offers))if(o.status==='pending'){reserve(s,o.from,o.give,o.id,-1);o.status='cancelled';}
 for(const b of Object.values(h.board))if(['open','accepted'].includes(b.status)){reserve(s,b.author,b.reward,b.id,-1);b.status='cancelled';}
 for(const d of Object.values(h.dice))if(['pending','accepted'].includes(d.status)){s.players[d.from].reservedGold-=d.stake;if(d.status==='accepted')s.players[d.to].reservedGold-=d.stake;d.status='cancelled';}
 for(const p of Object.values(h.production))if(p.status==='pending')p.status='cancelled';
 h.narrative=newNarrative(content.hidden17!.narrative!);
 h.narrative.announcements.push({id:`migration:${now}`,author:'gm',title:'Сюжетная редакция',text:s.phase==='setup'?'Открываются личные истории и документы.':'Прежние предложения и заказы отменены, резервы возвращены. Знание обряда открывается только из личных источников или после игровой сцены. Новые стремления оценивает ведущий отдельно.',at:now});
}
export function narrativeDecide(state:GameState,content:Content,command:Command,ctx:Ctx):Result|undefined {
 if(!command.type.startsWith('narrative.'))return;
 const cmd=command as NarrativeCommand;
 try {
  need(state.hidden17&&content.hidden17?.narrative,'Сюжетная редакция недоступна','phase');
  let s=structuredClone(state);const h=s.hidden17!, gm=ctx.actor.type==='gm',key=ctx.actor.type==='player'?ctx.actor.roleKey:'';
  const master=()=>need(gm,'Только ведущий','forbidden');
  const player=()=>need(key&&s.roster.includes(key)&&lookup(s.players,key)?.present,'Нужен присутствующий участник','forbidden');
  const open=()=>need(['act1','act2','act3'].includes(s.phase)&&h.ritual.step==='preparation'&&s.clock.pausedAt===undefined,'Действие сейчас недоступно','phase');
  if(cmd.type==='narrative.enable'){master();if(h.narrative)return ok();migrate(s,content,ctx.now);}
  else {
   need(h.narrative,'Сначала включите сюжетную редакцию','phase');const n=h.narrative;
   switch(cmd.type){
    case 'narrative.trade.create': {player();open();need(lookup(s.players,cmd.to)?.present && s.roster.includes(cmd.to) && cmd.to!==key,'Нужен другой присутствующий участник');validateBundle(s,key,cmd.give);text(cmd.wish,800,true);need(cmd.give.gold>0||cmd.give.items.length||INGREDIENTS.some(k=>cmd.give.ingredients[k]>0),'Пустое предложение');need(Object.values(n.trades).filter(t=>activeTrade(t)&&t.from===key).length<20,'Слишком много открытых предложений','limit');const id=ctx.newId();n.trades[id]={id,from:key,to:cmd.to,give:structuredClone(cmd.give),wish:cmd.wish,status:'offered',createdAt:ctx.now,expiresAt:ctx.now+300000,items:metadata(s,cmd.give)};reserve(s,key,cmd.give,id,1);break;}
    case 'narrative.trade.reply':case 'narrative.trade.confirm':case 'narrative.trade.decline':case 'narrative.trade.cancel':case 'narrative.trade.expire': {
     const t=lookup(n.trades,cmd.id);need(t&&activeTrade(t),'Сделка уже закрыта или не найдена','not_found');
     if(cmd.type==='narrative.trade.expire'){need(ctx.actor.type==='system','Только часы сервера','forbidden');open();need(ctx.now>=t.expiresAt,'Срок ещё не истёк');closeNarrativeTrade(s,t,'expired',ctx.now);break;}
     player();need(key===t.from||key===t.to,'Только участники сделки','forbidden');
     if(cmd.type==='narrative.trade.cancel'||cmd.type==='narrative.trade.decline'){closeNarrativeTrade(s,t,cmd.type==='narrative.trade.decline'?'declined':'cancelled',ctx.now);break;}
     open();need(ctx.now<t.expiresAt,'Срок сделки истёк','phase');need(s.players[t.from]?.present&&s.players[t.to]?.present,'Участник ушёл','phase');
     if(cmd.type==='narrative.trade.reply'){need(key===t.to&&t.status==='offered','Ответ уже отправлен или вы не адресат','forbidden');validateBundle(s,key,cmd.give);t.reply=structuredClone(cmd.give);t.items={...t.items,...metadata(s,cmd.give)};t.status='replied';reserve(s,key,cmd.give,t.id,1);}
     else {need(key===t.from&&t.status==='replied'&&t.reply,'Нужны ответ и подтверждение автора','forbidden');need(stillReserved(s,t,t.from,t.give)&&stillReserved(s,t,t.to,t.reply),'Резерв сделки изменился','reserved');const record={id:t.id,at:ctx.now,from:t.from,to:t.to,service:false,give:side(s,t.give),get:side(s,t.reply)};closeNarrativeTrade(s,t,'completed',ctx.now);s=transfer(s,t.from,t.to,t.give);s=transfer(s,t.to,t.from,t.reply);s.trades.push(record);}
     break;
    }
    case 'narrative.sell': {player();open();need(INGREDIENTS.includes(cmd.ingredient)&&Number.isSafeInteger(cmd.count)&&cmd.count>0,'Нужно целое положительное количество');need(available(s,key).ingredients[cmd.ingredient]>=cmd.count,'Материалы отсутствуют или обещаны','reserved');s.players[key].ingredients[cmd.ingredient]-=cmd.count;s.players[key].gold+=cmd.count;s.workshop[cmd.ingredient]+=cmd.count;break;}
    case 'narrative.announce': {if(!gm)player();open();text(cmd.title,100);text(cmd.text,1200);need(n.announcements.filter(a=>a.author===(gm?'gm':key)).length<100,'Лимит объявлений','limit');n.announcements.push({id:ctx.newId(),author:gm?'gm':key,title:cmd.title.trim(),text:cmd.text.trim(),at:ctx.now});break;}
    case 'narrative.document.show': {if(!gm)player();open();need(typeof cmd.allow==='boolean','Нужно согласие');const doc=content.hidden17.narrative.documents.find(d=>d.id===cmd.documentId);need(doc&&lookup(s.players,cmd.player)&&s.roster.includes(cmd.player),'Документ или участник не найден','not_found');need(gm||doc.holders.includes(key),'Показать или отозвать может владелец источника','forbidden');need(!doc.holders.includes(cmd.player),'Владелец сохраняет исходный документ');const access=n.documentAccess[cmd.player]??[];n.documentAccess[cmd.player]=cmd.allow?[...new Set([...access,doc.id])]:access.filter(id=>id!==doc.id);if(cmd.allow)n.knowledge[cmd.player]=[...new Set([...(n.knowledge[cmd.player]??[]),...(doc.knowledge??[])])];break;}
    case 'narrative.knowledge': {master();need(lookup(s.players,cmd.player)&&s.roster.includes(cmd.player)&&['place','joining'].includes(cmd.knowledge),'Неизвестное знание или участник');n.knowledge[cmd.player]=[...new Set([...(n.knowledge[cmd.player]??[]),cmd.knowledge])];break;}
    case 'narrative.goal': {master();need(lookup(s.players,cmd.player)&&s.roster.includes(cmd.player)&&(cmd.goal===0||cmd.goal===1),'Неверная цель');if(cmd.evaluation!==null){need(cmd.evaluation&&['achieved','partial','not-achieved'].includes(cmd.evaluation.status),'Неверная оценка');text(cmd.evaluation.note,1200,true);}const evaluations=n.evaluations[cmd.player]??={};if(cmd.evaluation===null)delete evaluations[cmd.goal];else evaluations[cmd.goal]=structuredClone(cmd.evaluation);break;}
    default:return fail('invalid','Неизвестная сюжетная команда');
   }
  }
  const bankDelta=Object.values(s.players).reduce((n,p)=>n+p.gold,0)-Object.values(state.players).reduce((n,p)=>n+p.gold,0);
  return ok({type:'Hidden17Changed',at:ctx.now,action:cmd.type,bankDelta,patch:{hidden17:s.hidden17,players:s.players,items:s.items,offers:s.offers,trades:s.trades,workshop:s.workshop}});
 }catch(e){if(e instanceof Invalid)return fail(e.code,e.message);if(e instanceof TypeError)return fail('invalid','Некорректные параметры');throw e;}
}

/** Сроки и освобождение резервов выводятся из старых событий, поэтому replay детерминирован. */
export function narrativeAfterEvent(before:GameState,after:GameState,event:Event):GameState {
 if(!after.hidden17?.narrative)return after;
 if(event.type==='FairOpened'){
  const s=structuredClone(after);
  s.hidden17!.narrative!.startingItemIds=Object.fromEntries(s.roster.map(key=>[key,Object.values(s.items).filter(i=>i.owner.type==='player'&&i.owner.key===key).map(i=>i.id)]));
  return s;
 }
 const active=Object.values(after.hidden17.narrative.trades).filter(activeTrade);
 const cancel=active.filter(t=>!after.players[t.from]?.present||!after.players[t.to]?.present||after.hidden17!.ritual.step!=='preparation'||['closed','revealed'].includes(after.phase));
 const pausedMs=(event.type==='ClockResumed'||event.type==='ActStarted')?event.pausedMs:0;
 if(!cancel.length&&!pausedMs)return after;
 const s=structuredClone(after);
 for(const t of active){const trade=s.hidden17!.narrative!.trades[t.id];if(cancel.includes(t))closeNarrativeTrade(s,trade,'cancelled',event.at);else if(pausedMs)trade.expiresAt+=pausedMs;}
 return s;
}
export function narrativeGuard(state:GameState,cmd:Command):Result|undefined {
 if(!state.hidden17?.narrative)return;
 if(/^(offer\.|hidden17\.board\.|hidden17\.dice\.|hidden17\.rumor$)/.test(cmd.type))return fail('phase','Используйте сюжетные сделки, объявления и физические кости');
}
