import type { Command, Ctx } from '../commands';
import type { Content } from '../content';
import type { Event } from '../events';
import { newFair, type FairCommand } from '../fair';
import { finalParticipant, FINAL_RULES } from '../final-rules';
import type { GameState } from '../types';
import { hiddenGoals, closeHiddenBusiness } from './hidden17';
import { fail, ok, type ErrorCode, type Result } from './result';

class Invalid extends Error { constructor(public code: ErrorCode, detail: string) { super(detail); } }
function need(value: unknown, detail: string, code: ErrorCode = 'invalid'): asserts value { if (!value) throw new Invalid(code, detail); }
const active = (s: GameState) => ['act1','act2','act3'].includes(s.phase);

/** Допуски и окна ответа проверяются на сервере, независимо от интерфейса. */
export function fairGuard(s: GameState, cmd: Command, ctx: Ctx): Result | undefined {
 const f=s.hidden17?.fair; if(!f)return;
 if(cmd.type==='act.next')return fail('phase','Ярмарка идёт непрерывно; события запускаются отдельно');
 if(cmd.type.startsWith('hidden17.ritual.') && ctx.actor.type==='player') {
  if(!(s.hidden17?.rulesVersion===2 && s.hidden17.ritual.step==='preparation' && ['hidden17.ritual.offer','hidden17.ritual.permission'].includes(cmd.type) ? finalParticipant(s,ctx.actor.roleKey,ctx.now) : f.participants?.includes(ctx.actor.roleKey)))return fail('forbidden','Круг уже замкнут. Вы наблюдаете за сценой');
  if(cmd.type==='hidden17.ritual.order')return fail('invalid','После пробуждения донор произносит приказ ведущему');
 }
 if(s.clock.pausedAt!==undefined && (cmd.type.startsWith('hidden17.ritual.') || cmd.type==='hidden17.prepare'))return fail('phase','Ярмарка на паузе');
 if(s.hidden17!.ritual.step!=='preparation' && cmd.type==='gm.correct' && cmd.change.field==='itemOwner')return fail('phase','Передача вещей остановлена на время обряда');
}

export function fairDecide(state: GameState, content: Content, command: Command, ctx: Ctx): Result | undefined {
 if(!command.type.startsWith('fair.'))return;
 const cmd=command as FairCommand;
 try {
  need(state.hidden17?.narrative,'Нужна сюжетная редакция','phase');
  const s=structuredClone(state),h=s.hidden17!,r=h.ritual;
  const master=()=>need(ctx.actor.type==='gm','Только ведущий','forbidden');
  const key=ctx.actor.type==='player'?ctx.actor.roleKey:'';
  const player=()=>need(key && s.players[key]?.present && s.roster.includes(key),'Нужен присутствующий игрок','forbidden');
  const before=()=>need(active(s) && r.step==='preparation','Сцена доступна до обряда','phase');
  const unpaused=()=>need(s.clock.pausedAt===undefined,'Ярмарка на паузе','phase');
  const own=(id:string)=>{const i=s.items[id];need(i?.owner.type==='player'&&i.owner.key===key,'Нужна собственная вещь','not_owner');need(!i.reservedFor,'Вещь зарезервирована','reserved');return i;};
  if(cmd.type==='fair.enable') {
   master();need(r.step==='preparation' && (active(s)||s.phase==='setup'),'Переход возможен до начала обряда','phase');
   if(h.fair)return ok();
   const used=Math.max(0,Number(s.phase.slice(-1))-1)||0;
   h.fair={...newFair(),refreshes:used,resupplies:used,auctionReleased:Object.values(s.items).some(i=>i.kind==='shard'&&i.ref==='IV')};
   // История и собственность сохраняются; приготовленные знаки становятся бутылочками того же донора.
   for(const [id,p] of Object.entries(h.prepared))if(p.method==='sign') {delete p.order;if(s.items[id])s.items[id].ref='blood-vial';}
   for(const key of Object.keys(h.signatureActs))if(h.signatureActs[key]===s.phase)h.signatureActs[key]=`fair:${used}`;
   for(const l of Object.values(s.lots))if(l.status==='queued'){l.status='announced';l.act=1;}
   // Старое предварительное размещение не даёт права попасть в новый закрытый круг.
   for(const id of [...r.circle,...r.focuses])if(s.items[id]?.reservedFor==='hidden17:ritual')delete s.items[id].reservedFor;
   r.circle=[];r.focuses=[];r.permissions={};
  } else {
   need(h.fair,'Непрерывная ярмарка не включена','phase');const f=h.fair;
   switch(cmd.type) {
    case 'fair.ritual.announce': {
     master();before();unpaused();need(h.rulesVersion===2,'Нужна новая редакция','phase');
     if(!f.ritualAnnouncement){f.ritualAnnouncement={announcedAt:ctx.now,deadline:ctx.now+FINAL_RULES.ritualWarningMs};s.announcements.push({at:ctx.now,title:'Последние пять минут',text:'Через пять минут ведущий сможет остановить торговлю для заключительной сцены. Завершайте дела.'});}break;
    }
    case 'fair.ritual.cancel-announcement':master();before();unpaused();need(h.rulesVersion===2,'Нужна новая редакция','phase');delete f.ritualAnnouncement;s.announcements.push({at:ctx.now,title:'Ярмарка продолжается',text:'Предупреждение о завершении торговли отменено.'});break;
    case 'fair.help.resolve': {
     master();unpaused();need(h.rulesVersion===2&&r.step==='finished'&&r.outcome?.life==='awake','Помощь доступна после пробуждения','phase');need(!f.help,'Большая помощь уже использована','limit');
     need(['seed','fort','dead','freedom','form','caravan'].includes(cmd.effect),'Неизвестная помощь');
     need(s.roster.includes(cmd.beneficiary)&&s.players[cmd.beneficiary]?.present,'Нужен присутствующий получатель');
     need(typeof cmd.note==='string'&&!!cmd.note.trim()&&cmd.note.length<=1500,'Нужно пояснение');
     need(cmd.mode===(r.outcome.freedom==='free'?'free':'command'),'Режим не соответствует свободе Сарна');
     const donor=r.outcome.controller;if(cmd.mode==='command')need(donor&&s.roster.includes(donor)&&s.players[donor]?.present,'Приказ может произнести только присутствующий донор');
     f.help={effect:cmd.effect,beneficiary:cmd.beneficiary,mode:cmd.mode,note:cmd.note.trim(),at:ctx.now,...(cmd.mode==='command'?{donor}:{})};break;
    }
    case 'fair.portion.resolve': {
     master();unpaused();need(h.rulesVersion===2&&r.step==='finished'&&r.outcome?.life==='awake','Порция доступна только после пробуждения','phase');
     need(s.roster.includes(cmd.owner)&&s.players[cmd.owner]?.present&&r.outcome.vessels[cmd.owner]==='full','Нужен присутствующий владелец полной порции');
     need(!f.portions?.[cmd.owner],'Порция уже использована','limit');need(['seed','focus','spring'].includes(cmd.effect),'Неизвестное применение');need(typeof cmd.note==='string'&&!!cmd.note.trim()&&cmd.note.length<=1500,'Нужно пояснение согласия и результата');
     const itemId=cmd.effect==='focus'?ctx.newId():undefined;if(itemId)s.items[itemId]={id:itemId,kind:'focus',ref:'focus',owner:{type:'player',key:cmd.owner}};
     (f.portions??={})[cmd.owner]={owner:cmd.owner,effect:cmd.effect,note:cmd.note.trim(),at:ctx.now,...(itemId?{itemId}:{})};break;
    }
    case 'fair.refresh': {
     master();before();unpaused();need(f.refreshes<2,'Все восстановления уже использованы','limit');
     need(!Object.values(s.requests).some(q=>q.status==='pending'),'Сначала завершите или отмените запросы согласия');
     need(!Object.values(h.production).some(q=>q.status==='pending'&&q.ability),'Сначала завершите заказы со способностью');
     for(const p of Object.values(s.players)){p.abilityUsedInAct=false;p.hostileAttemptsAgainstInAct=0;p.thorns=false;p.discount=false;delete p.abilityPending;delete p.protection;delete p.thornsBy;delete p.discountBy;}
     for(const card of Object.values(s.story?.cards??{}))if(card.expiresAct!==null)s.story!.cards[card.id]={...card,active:false,revision:card.revision+1};
     f.actionStart=s.actions.length;f.refreshes++;s.announcements.push({at:ctx.now,title:'Передышка',text:'Силы вернулись: способности снова доступны. Временные чары рассеялись.'});break;
    }
    case 'fair.resupply':master();before();unpaused();need(f.resupplies<2,'Все поставки уже прибыли','limit');for(const k of ['ash','moon','dew'] as const)s.workshop[k]+=Math.ceil(s.nPresent/6);f.resupplies++;s.announcements.push({at:ctx.now,title:'Новый запас',text:'В мастерскую привезли ингредиенты.'});break;
    case 'fair.auction': {
     master();before();unpaused();need(!f.auctionReleased&&!r.extinguished.includes('IV')&&!Object.values(s.items).some(i=>i.kind==='shard'&&i.ref==='IV'),'Этот лот уже появился','limit');
     const id=ctx.newId(),shard=ctx.newId(),clue=ctx.newId();
     s.items[shard]={id:shard,kind:'shard',ref:'IV',owner:{type:'lot',id}};s.items[clue]={id:clue,kind:'clue',ref:'A',owner:{type:'lot',id}};
     s.lots[id]={id,items:[shard,clue],act:1,status:'announced',bids:[]};f.auctionReleased=true;
     s.announcements.push({at:ctx.now,title:'Аукцион',text:'На торги выставлены Осколок IV и старая запись. Ведущий объявит начало торгов.'});break;
    }
    case 'fair.admit': {
     master();before();const q=s.story?.requests[cmd.requestId];need(q&&q.author===cmd.player&&!['cancelled','rejected'].includes(q.status),'Нужна собственная действующая заявка героя');
     need(s.players[cmd.player]?.present&&Number.isSafeInteger(cmd.at)&&cmd.at>=0,'Укажите присутствующего героя и время');
     f.admissions[cmd.player]={requestId:q.id,at:cmd.at};break;
    }
    case 'fair.admission.remove':master();before();delete f.admissions[cmd.player];break;
    case 'fair.finish': {
     master();before();unpaused();need(!Object.values(f.destruction).some(d=>['pending','active'].includes(d.status)),'Сначала завершите сцены с осколками');
     need(!Object.values(h.dice).some(d=>d.status==='started'),'Сначала закончите начатые броски');
     closeHiddenBusiness(s,ctx.now);
     if(h.rulesVersion===2){for(const id of [...r.circle,...r.focuses])if(s.items[id]?.reservedFor==='hidden17:ritual')delete s.items[id].reservedFor;r.circle=[];r.focuses=[];}
     r.outcome={life:r.extinguished.length>=3?'destroyed':'sleep',freedom:'free',power:'empty',vessels:{},goals:{}};r.step='finished';r.outcome.goals=hiddenGoals(s,content);break;
    }
    case 'fair.destroy.request': {
     player();before();unpaused();const target=own(cmd.itemId),salt=own(cmd.saltId);
     need(target.kind==='shard'&&!r.extinguished.includes(target.ref),'Нужен целый осколок');need(h.prepared[salt.id]?.method==='salt','Нужна приготовленная Разрывная соль');
     need(!Object.values(f.destruction).some(d=>d.author===key&&['pending','active'].includes(d.status)),'Сначала завершите свою предыдущую сцену');
     const id=ctx.newId();target.reservedFor=id;salt.reservedFor=id;f.destruction[id]={id,author:key,targetId:target.id,ref:target.ref,saltId:salt.id,status:'pending'};break;
    }
    case 'fair.destroy.start':case 'fair.destroy.cancel':case 'fair.destroy.ward':case 'fair.destroy.resolve': {
     before();const d=f.destruction[cmd.id];need(d&&['pending','active'].includes(d.status),'Сцена уже завершена');
     const target=s.items[d.targetId];need(target?.owner.type==='player'&&target.owner.key===d.author&&target.reservedFor===d.id,'Осколок недоступен');
     if(cmd.type==='fair.destroy.start') {master();unpaused();need(d.status==='pending'&&s.players[d.author]?.present,'Нужна заявка присутствующего героя');need(s.items[d.saltId]?.reservedFor===d.id,'Соль недоступна');delete s.items[d.saltId];d.status='active';d.startedAt=ctx.now;d.endsAt=ctx.now+120000;}
     else if(cmd.type==='fair.destroy.cancel'){need(ctx.actor.type==='gm'||key===d.author,'Отменить может автор или ведущий','forbidden');if(s.items[d.saltId]?.reservedFor===d.id)delete s.items[d.saltId].reservedFor;delete target.reservedFor;d.status='cancelled';}
     else if(cmd.type==='fair.destroy.ward'){player();unpaused();need(d.status==='active'&&ctx.now<=d.endsAt!,'Время спасения истекло');const ward=own(cmd.itemId);need(ward.kind==='ward','Нужен Защитный талисман');delete s.items[ward.id];delete target.reservedFor;d.status='saved';d.wardBy=key;}
     else {master();unpaused();need(d.status==='active'&&ctx.now>=d.endsAt!,'Дайте участникам две минуты для спасения');delete s.items[target.id];delete h.presentations[target.id];delete r.permissions[target.id];if(!r.extinguished.includes(d.ref))r.extinguished.push(d.ref);d.status='destroyed';}
     break;
    }
    default:return fail('invalid','Неизвестная команда ярмарки');
   }
  }
  return ok({type:'Hidden17Changed',at:ctx.now,action:cmd.type,bankDelta:0,patch:{hidden17:h,players:s.players,items:s.items,lots:s.lots,offers:s.offers,requests:s.requests,workshop:s.workshop,story:s.story,announcements:s.announcements}});
 } catch(e){if(e instanceof Invalid)return fail(e.code,e.message);if(e instanceof TypeError)return fail('invalid','Некорректные параметры команды');throw e;}
}

/** Пауза продлевает публичное окно спасения, не выполняя сцену за ведущего. */
export function fairAfterEvent(after:GameState,e:Event):GameState {
 const h=after.hidden17,f=h?.fair;if(!h||!f)return after;
 const pausedMs=e.type==='ClockResumed'?e.pausedMs:0;
 const stale=h.rulesVersion===2&&h.ritual.step==='preparation'?[...h.ritual.circle,...h.ritual.focuses].filter(id=>{
  const i=after.items[id];if(!i||i.owner.type!=='player'||!after.players[i.owner.key]?.present)return true;
  const a=f.admissions[i.owner.key],q=a&&after.story?.requests[a.requestId];return !a||a.at>e.at||!q||q.author!==i.owner.key||['cancelled','rejected'].includes(q.status);
 }):[];
 if(!pausedMs&&!stale.length)return after;
 const next=structuredClone(after),fair=next.hidden17!.fair!,r=next.hidden17!.ritual;
 for(const id of stale){if(next.items[id]?.reservedFor==='hidden17:ritual')delete next.items[id].reservedFor;r.circle=r.circle.filter(x=>x!==id);r.focuses=r.focuses.filter(x=>x!==id);}
 if(pausedMs){for(const d of Object.values(fair.destruction))if(d.status==='active'&&d.endsAt!==undefined)d.endsAt+=pausedMs;if(fair.ritualAnnouncement)fair.ritualAnnouncement.deadline+=pausedMs;}
 return next;
}
