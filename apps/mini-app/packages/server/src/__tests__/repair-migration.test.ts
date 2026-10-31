import { expect, test } from 'vitest';
import { type Event, type HiddenEvent, initialState, reduce, viewFor } from '@fair/shared';
import { content as base, testOpts } from './fixtures';
import { attachHiddenScenario } from '../scenario';
import { EventStore } from '../store';
import { Game } from '../game';
import { repairMigrationKnowledge, REPAIR_ACTION } from '../repair-migration';
const content = attachHiddenScenario(base);
function fixture() {
  const store = new EventStore(':memory:');
  const game = Game.open(store, content, {...testOpts(), hidden17:true});
  const events = store.all();
  const h = structuredClone(game.state().hidden17!);
  store.close();
  for (const role of Object.keys(h.narrative!.knowledge)) h.narrative!.knowledge[role] = [...new Set([...h.narrative!.knowledge[role], 'joining' as const])];
  h.narrative!.announcements.push({id:'migration:test',author:'gm',title:'Сюжетная редакция',text:'Прежнее ошибочное сообщение',at:10});
  const migration:HiddenEvent = {type:'Hidden17Changed',action:'narrative.enable',at:10,seq:events.length+1,bankDelta:0,patch:{hidden17:h}};
  return [...events,migration];
}
test('repair preserves all game state except automatic joining and migration notice; replay hides formula',()=>{
  const events=fixture(), original=structuredClone(events), before=events.reduce((s,e)=>reduce(s,content,e),initialState(content,{}));
  const result=repairMigrationKnowledge(events,content,20);
  expect(result?.removed).toHaveLength(15);expect(events).toEqual(original);
  expect(Object.keys(result!.event.patch)).toEqual(['hidden17']);
  const after=reduce(before,content,result!.event);
  const beforeRest={...before,hidden17:undefined,seq:0},afterRest={...after,hidden17:undefined,seq:0};expect(afterRest).toEqual(beforeRest);
  const oldH=structuredClone(before.hidden17!),newH=structuredClone(after.hidden17!);
  oldH.narrative!.knowledge=newH.narrative!.knowledge;oldH.narrative!.announcements=newH.narrative!.announcements;expect(newH).toEqual(oldH);
  expect(after.hidden17!.narrative!.knowledge.o5).toContain('joining');expect(after.hidden17!.narrative!.knowledge.o17).toContain('joining');
  expect(after.hidden17!.narrative!.knowledge.o4).toEqual(['place']);
  expect(after.hidden17!.narrative!.knowledge.o1).not.toContain('joining');
  const v=viewFor(after,content,{type:'player',roleKey:'o1'},20);expect(JSON.stringify(v)).not.toContain(content.hidden17!.ritual.formula);
  expect(repairMigrationKnowledge([...events,result!.event],content,30)).toBeNull();
});
test('repair refuses later knowledge or unfamiliar changes rather than erasing learned information',()=>{
  const events=fixture();const last=events.at(-1) as HiddenEvent;
  expect(()=>repairMigrationKnowledge([...events,{...last,action:'narrative.knowledge',at:11}],content,20)).toThrow();
  expect(()=>repairMigrationKnowledge([...events,{...last,action:'unrecognized.change',at:11}],content,20)).toThrow();
});
test('repair keeps joining supported by an accessible source and refuses a started ritual',()=>{
  const events=fixture();const last=events.at(-1) as HiddenEvent;
  last.patch.hidden17!.narrative!.documentAccess.o1.push('velda-joining');
  const r=repairMigrationKnowledge(events,content,20)!;expect(r.removed).not.toContain('o1');
  last.patch.hidden17!.ritual.step='assembly';expect(()=>repairMigrationKnowledge(events,content,20)).toThrow();
});
test('already repaired and clean migrations require no new event',()=>{
  expect(repairMigrationKnowledge([{type:'Hidden17Changed',action:REPAIR_ACTION,at:10,patch:{}}],content,20)).toBeNull();
  const events=fixture(),last=events.at(-1) as HiddenEvent;
  for(const key of Object.keys(last.patch.hidden17!.narrative!.knowledge))if(!['o5','o17'].includes(key))last.patch.hidden17!.narrative!.knowledge[key]=[];
  expect(repairMigrationKnowledge(events,content,20)).toBeNull();
});

test('repair preserves a subsequent exchange and clock changes',()=>{
  const events=fixture();const last=events.at(-1) as HiddenEvent;
  const h=structuredClone(last.patch.hidden17!);h.narrative!.announcements.push({id:'later',author:'o1',title:'Поздняя запись',text:'Сохранить',at:12});
  const before=events.reduce((s,e)=>reduce(s,content,e),initialState(content,{}));
  const players=structuredClone(before.players);players.o1.gold-=1;players.o2.gold+=1;
  const trade:HiddenEvent={type:'Hidden17Changed',action:'narrative.trade.confirm',at:12,patch:{hidden17:h,players}};
  const log:Event[]=[...events,{type:'ClockResumed',at:11,pausedMs:0},trade];
  const result=repairMigrationKnowledge(log,content,20)!;expect(result.removed).toHaveLength(15);
  const current=log.reduce((s,e)=>reduce(s,content,e),initialState(content,{}));const repaired=reduce(current,content,result.event);
  expect(repaired.players).toEqual(players);expect(repaired.clock).toEqual(current.clock);expect(repaired.hidden17!.narrative!.announcements.at(-1)?.id).toBe('later');
});
