import type { GameState } from './types';
import type { HiddenChoice, HiddenMethod } from './hidden17';

/** Общедоступные числовые правила, без закрытых источников и состава. */
export const FINAL_RULES = { startingGold: 8, workshopSurcharge: 2, ritualWarningMs: 300000, shards: 3, focuses: 2 } as const;
export const COMPONENT_EFFECTS: Record<HiddenMethod,string> = {
 salt: 'Разрывная соль уничтожает один доступный целый осколок сердца.',
 sign: 'Кровь создаёт связь с донором и право на одно распоряжение после пробуждения.',
 vessel: 'Сосуд отводит часть силы пробуждённого дракона: один получает полную порцию, несколько — слабые.',
};
export function finalParticipant(s:GameState,key:string,now:number):boolean {
 const a=s.hidden17?.fair?.admissions[key],q=a&&s.story?.requests[a.requestId];
 return !!(a&&s.roster.includes(key)&&s.players[key]?.present&&a.at<=now&&q?.author===key&&!['cancelled','rejected'].includes(q.status));
}
export interface FinalRitualReadiness { ready:boolean; reasons:string[]; participants:string[]; shards:number; focuses:number; joining:boolean; deadline?:number }
/** Для движка и пульта ведущего; результат со списком участников нельзя отправлять игрокам. */
export function finalRitualReadiness(s:GameState,now:number):FinalRitualReadiness {
 const h=s.hidden17,f=h?.fair,r=h?.ritual,participants=Object.keys(f?.admissions??{}).filter(k=>finalParticipant(s,k,now));
 const eligible=(id:string,kind:string)=>{const i=s.items[id];return !!(i?.kind===kind&&i.owner.type==='player'&&participants.includes(i.owner.key)&&i.reservedFor==='hidden17:ritual');};
 const shards=new Set((r?.circle??[]).filter(id=>eligible(id,'shard')&&!r!.extinguished.includes(s.items[id].ref)).map(id=>s.items[id].ref)).size;
 const focuses=new Set((r?.focuses??[]).filter(id=>eligible(id,'focus'))).size;
 const joining=participants.some(k=>h?.narrative?.knowledge[k]?.includes('joining')),deadline=f?.ritualAnnouncement?.deadline,reasons:string[]=[];
 if(h?.rulesVersion!==2||!f||!['act1','act2','act3'].includes(s.phase)||r?.step!=='preparation')reasons.push('Подготовка обряда недоступна');
 if(s.clock.pausedAt!==undefined)reasons.push('Ярмарка на паузе');
 if(deadline===undefined||now<deadline)reasons.push('Сначала объявите и выдержите последние пять минут');
 if(!joining)reasons.push('Нужен прибывший по действующей заявке знаток обряда');
 if(shards<FINAL_RULES.shards||focuses<FINAL_RULES.focuses)reasons.push('Нужны три разные целые зарезервированные части и два Фокуса допущенных участников');
 if(Object.values(f?.destruction??{}).some(d=>['pending','active'].includes(d.status)))reasons.push('Сначала завершите сцены с осколками');
 if(Object.values(h?.dice??{}).some(d=>d.status==='started'))reasons.push('Сначала закончите начатые броски');
 return {ready:!reasons.length,reasons,participants,shards,focuses,joining,...(deadline===undefined?{}:{deadline})};
}
/** Группа определяется раскрытым эффектом, а не статусом выбранной попытки. */
export function ritualEffectGroup(c:HiddenChoice):string {
 return c.kind==='salt'?`salt:${c.targetId}`:c.kind==='sign'?`sign:${c.controller}`:`vessel:${c.id??c.player}`;
}
