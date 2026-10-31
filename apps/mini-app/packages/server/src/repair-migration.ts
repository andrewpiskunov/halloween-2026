import { initialState, reduce, type Content, type Event, type HiddenEvent } from '@fair/shared';
export const REPAIR_ACTION = 'narrative.migrationKnowledge.repair';

const safeActions = new Set(['create', 'reply', 'confirm', 'decline', 'cancel', 'expire'].map(a => `narrative.trade.${a}`));
/** Допускает после переноса только обмены и паузу, которые не меняют знания. */
export function repairMigrationKnowledge(events: Event[], content: Content, at: number): { event: HiddenEvent; removed: string[] } | null {
  let migrationIndex=-1, repairIndex=-1;
  events.forEach((e,i)=>{if(e.type==='Hidden17Changed'){if(e.action==='narrative.enable')migrationIndex=i;if(e.action===REPAIR_ACTION)repairIndex=i;}});
  if(repairIndex>=0&&repairIndex>migrationIndex)return null;
  if(migrationIndex<0)throw new Error('Не найден перенос сюжетной редакции.');
  const migration=events[migrationIndex] as HiddenEvent;
  const original=migration.patch.hidden17?.narrative;
  for(const e of events.slice(migrationIndex+1)) {
    if(e.type==='ClockPaused'||e.type==='ClockResumed')continue;
    if(e.type!=='Hidden17Changed'||!safeActions.has(e.action))throw new Error('После переноса есть действия, требующие отдельной проверки знаний.');
    const n=e.patch.hidden17?.narrative;
    if(n&&(JSON.stringify(n.knowledge)!==JSON.stringify(original?.knowledge)||JSON.stringify(n.documentAccess)!==JSON.stringify(original?.documentAccess)))throw new Error('Знания или доступ к источникам изменились после переноса.');
  }
  const current=events.reduce((s,e)=>reduce(s,content,e),initialState(content,{}));
  const h=current.hidden17, source=content.hidden17?.narrative;
  if(!h?.narrative||!source||h.ritual.step!=='preparation')throw new Error('Нет подходящей сюжетной редакции или финал уже начат.');
  const hidden17=structuredClone(h), n=hidden17.narrative!;
  const removed:string[]=[];
  for(const [key,knowledge] of Object.entries(n.knowledge)) {
    const supported=source.documents.some(d=>d.knowledge?.includes('joining')&&(d.holders.includes(key)||(n.documentAccess[key]??[]).includes(d.id)));
    if(knowledge.includes('joining')&&!supported){n.knowledge[key]=knowledge.filter(k=>k!=='joining');removed.push(key);}
  }
  if(!removed.length)return null;
  for(const notice of n.announcements)if(notice.id.startsWith('migration:'))notice.text='Сюжетная редакция включена. Знания обряда доступны из личных источников или после игровой сцены.';
  return {removed,event:{type:'Hidden17Changed',action:REPAIR_ACTION,at,bankDelta:0,patch:{hidden17}}};
}
