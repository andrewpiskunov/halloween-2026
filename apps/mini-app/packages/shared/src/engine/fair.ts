import type { Command, Ctx } from '../commands';
import type { Content } from '../content';
import type { Event } from '../events';
import { newFair, type FairCommand } from '../fair';
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
  if(!f.participants?.includes(ctx.actor.roleKey))return fail('forbidden','Круг уже замкнут. Вы наблюдаете за сценой');
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
   }
  }
  return ok({type:'Hidden17Changed',at:ctx.now,action:cmd.type,bankDelta:0,patch:{hidden17:h,players:s.players,items:s.items,lots:s.lots,offers:s.offers,requests:s.requests,workshop:s.workshop,story:s.story,announcements:s.announcements}});
 } catch(e){if(e instanceof Invalid)return fail(e.code,e.message);if(e instanceof TypeError)return fail('invalid','Некорректные параметры команды');throw e;}
}

/** Пауза продлевает публичное окно спасения, не выполняя сцену за ведущего. */
export function fairAfterEvent(after:GameState,e:Event):GameState {
 if(!after.hidden17?.fair||e.type!=='ClockResumed'||!e.pausedMs)return after;
 const next=structuredClone(after);for(const d of Object.values(next.hidden17!.fair!.destruction))if(d.status==='active'&&d.endsAt!==undefined)d.endsAt+=e.pausedMs;
 return next;
}
