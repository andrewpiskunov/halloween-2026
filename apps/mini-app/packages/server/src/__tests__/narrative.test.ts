import { afterEach, expect, test } from 'vitest';
import { attachHiddenScenario } from '../scenario';
import { parseCommandMessage } from '../ws';
import { EventStore } from '../store';
import { Game } from '../game';
import { content, gm, testOpts, empty } from './fixtures';
import { viewFor, type NarrativeContent } from '@fair/shared';
const stores:EventStore[]=[];afterEach(()=>{for(const s of stores.splice(0))s.close();});
const db=()=>{const s=new EventStore(':memory:');stores.push(s);return s;};
const c=attachHiddenScenario(content,undefined,false);
c.hidden17!.narrative={version:2,roles:Object.fromEntries(Object.keys(c.hidden17!.roles).map(k=>[k,{story:['История'],goals:['Цель','Цель'],gmGoals:['Критерий','Критерий'],abilityOrigin:'Дар',documents:[],startingItems:{}}])),documents:[],items:{},rules:[],craftingRules:[]} satisfies NarrativeContent;
test('WS understands narrative commands, long wishes/notes and nullable evaluation',()=>{for(const cmd of [{type:'narrative.trade.create',to:'o2',give:empty(),wish:'а'.repeat(800)},{type:'narrative.goal',player:'o2',goal:0,evaluation:null},{type:'narrative.goal',player:'o2',goal:0,evaluation:{status:'partial',note:'а'.repeat(1000)}}])expect(parseCommandMessage(JSON.stringify({kind:'cmd',id:'n',cmd}))).toHaveProperty('cmd');});
test('new journal enables narrative; persisted old journal stays old; reset opts in',async()=>{const opts={...testOpts(),hidden17:true};const fresh=Game.open(db(),c,opts);expect(fresh.state().hidden17?.narrative?.version).toBe(2);const oldStore=db();Game.open(oldStore,attachHiddenScenario(content,undefined,false),opts);const old=Game.open(oldStore,c,opts);expect(old.state().hidden17?.narrative).toBeUndefined();expect((await old.submit('enable',{type:'narrative.enable'},gm)).ok).toBe(true);expect(Game.open(oldStore,c,opts).state()).toEqual(old.state());await old.submit('reset',{type:'session.reset'},gm);expect(old.state().hidden17?.narrative?.version).toBe(2);});
test('serialized submit deduplicates completed exchange and ticker expiry is replayable',async()=>{const store=db(),opts={...testOpts(),hidden17:true};const g=Game.open(store,c,opts);for(const key of ['o1','o2'])await g.submit('present'+key,{type:'player.setPresent',roleKey:key,present:true},gm);await g.submit('open',{type:'session.open'},gm);const a={type:'player' as const,roleKey:'o1'},b={type:'player' as const,roleKey:'o2'};expect((await g.submit('offer',{type:'narrative.trade.create',to:'o2',give:{...empty(),gold:2},wish:''},a)).ok).toBe(true);const id=Object.keys(g.state().hidden17!.narrative!.trades)[0];await g.submit('reply',{type:'narrative.trade.reply',id,give:empty()},b);const cmd={type:'narrative.trade.confirm' as const,id};expect(await g.submit('confirm',cmd,a)).toEqual(await g.submit('confirm',cmd,a));expect(g.state().players.o1.gold).toBe(4);expect(g.state().trades).toHaveLength(1);await g.submit('offer2',{type:'narrative.trade.create',to:'o2',give:{...empty(),gold:1},wish:''},a);opts.clock.now+=300001;await g.tick();await g.submit('barrier',{type:'clock.pause'},gm);expect(Object.values(g.state().hidden17!.narrative!.trades).filter(t=>t.status==='expired')).toHaveLength(1);expect(Game.open(store,c,opts).state()).toEqual(g.state());});

test('all 17 live scenario projections isolate documents, joining formula, origins and relic catalogue',async()=>{
 const actual=attachHiddenScenario(content);expect(actual.hidden17?.narrative?.version).toBe(2);
 const g=Game.open(db(),actual,{...testOpts(),hidden17:true});
 for(const roleKey of Object.keys(actual.hidden17!.roles))await g.submit('present:'+roleKey,{type:'player.setPresent',roleKey,present:true},gm);
 await g.submit('open',{type:'session.open'},gm);
 for(const key of g.state().roster){
  const view=viewFor(g.state(),actual,{type:'player',roleKey:key},1000);expect(view.kind).toBe('player');if(view.kind!=='player')continue;
  const n=view.hidden17!.narrative!;expect(n).toBeDefined();expect(view.public.relics).toEqual([]);expect(n.role).not.toHaveProperty('gmGoals');expect(view.me.goals).toEqual([]);
  const raw=JSON.stringify(view);
  if(!n.knowledge.includes('joining')){expect(raw,key).not.toContain(actual.hidden17!.ritual.formula);expect(view.hidden17!.ritual.stone).toEqual([]);}
  for(const doc of actual.hidden17!.narrative!.documents)if(!doc.holders.includes(key))expect(raw,key+' / '+doc.id).not.toContain(doc.text);
  for(const [itemRef] of Object.entries(n.items))if(itemRef.startsWith('relic:'))expect(Object.values(view.hidden17!.knownItems).some(i=>`${i.kind}:${i.ref}`===itemRef)).toBe(true);
 }
});
