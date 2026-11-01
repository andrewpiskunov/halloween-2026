import {afterEach,expect,test} from 'vitest';
import {attachHiddenScenario as attachCurrent} from '../scenario';
const attachHiddenScenario:typeof attachCurrent=(...args)=>{const c=attachCurrent(...args);if(c.hidden17)c.hidden17.rulesVersion=undefined;return c;};
import {EventStore} from '../store';
import {Game} from '../game';
import {content,gm,testOpts,empty} from './fixtures';
import {parseCommandMessage} from '../ws';
const stores:EventStore[]=[];afterEach(()=>{for(const s of stores.splice(0))s.close();});
const db=()=>{const s=new EventStore(':memory:');stores.push(s);return s;};
const next=attachHiddenScenario(content),old=attachHiddenScenario(content,undefined,true,false);
test('новая партия сразу непрерывная; миграция старой сохраняет сделки и выполняется один раз',async()=>{
 const opts={...testOpts(),hidden17:true};expect(Game.open(db(),next,opts).state().hidden17!.fair?.version).toBe(1);
 const store=db(),g=Game.open(store,old,opts);
 for(const roleKey of ['o1','o2'])await g.submit('p'+roleKey,{type:'player.setPresent',roleKey,present:true},gm);
 await g.submit('open',{type:'session.open'},gm);await g.submit('act2',{type:'act.next'},gm);
 await g.submit('trade',{type:'narrative.trade.create',to:'o2',give:{...empty(),gold:2},wish:'Подарок'}, {type:'player',roleKey:'o1'});
 await g.submit('pause',{type:'clock.pause'},gm);
 const before=structuredClone(g.state()),migrated=Game.open(store,next,opts);
 expect(migrated.state().players).toEqual(before.players);expect(migrated.state().items).toEqual(before.items);
 expect(migrated.state().hidden17!.narrative).toEqual(before.hidden17!.narrative);
 expect(migrated.state().clock).toEqual(before.clock);
 expect(migrated.state().hidden17!.fair).toMatchObject({version:1,refreshes:1,resupplies:1,auctionReleased:true});
 const seq=migrated.state().seq;expect(seq).toBe(before.seq+1);expect(Game.open(store,next,opts).state().seq).toBe(seq);
 expect((await migrated.submit('newact',{type:'act.next'},gm)).ok).toBe(false);
});
test('начатый старый финал не меняет правила при перезапуске; сброс включает новые',async()=>{
 const store=db(),opts={...testOpts(),hidden17:true},g=Game.open(store,old,opts);
 await g.submit('present',{type:'player.setPresent',roleKey:'o1',present:true},gm);await g.submit('open',{type:'session.open'},gm);
 await g.submit('a2',{type:'act.next'},gm);await g.submit('a3',{type:'act.next'},gm);await g.submit('start',{type:'hidden17.ritual.start'},gm);
 const resumed=Game.open(store,next,opts);expect(resumed.state().hidden17!.fair).toBeUndefined();expect(resumed.state()).toEqual(g.state());
 await resumed.submit('reset',{type:'session.reset'},gm);expect(resumed.state().hidden17!.fair?.version).toBe(1);
});
test('websocket принимает новые команды; повтор события не создаёт второй лот',async()=>{
 const store=db(),g=Game.open(store,next,{...testOpts(),hidden17:true});await g.submit('present',{type:'player.setPresent',roleKey:'o1',present:true},gm);await g.submit('open',{type:'session.open'},gm);
 const cmd={type:'fair.auction'} as const;expect(parseCommandMessage(JSON.stringify({kind:'cmd',id:'auction',cmd}))).toHaveProperty('cmd');
 const a=await g.submit('auction',cmd,gm),b=await g.submit('auction',cmd,gm);expect(a).toEqual(b);expect(a.ok).toBe(true);
 expect(Object.values(g.state().items).filter(i=>i.kind==='shard'&&i.ref==='IV')).toHaveLength(1);
 expect((await g.submit('again',cmd,gm)).ok).toBe(false);
});
