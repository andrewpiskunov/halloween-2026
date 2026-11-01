import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {content as legacy,gm,player,testCodes,bundle} from './helpers';
import {execute,initialState} from '../engine';
import {viewFor} from '../views';
import type {Content} from '../content';
import type {Actor,Command} from '../commands';
import type {GameState,ItemKind} from '../types';
const source=JSON.parse(readFileSync(new URL('../../../../../../docs/design/gm-book/hidden-17.json',import.meta.url),'utf8'));
source.narrative=JSON.parse(readFileSync(new URL('../../../../../../docs/design/gm-book/narrative-17.json',import.meta.url),'utf8'));
const content:Content={...legacy,hidden17:source};let uid=0;
class Game{
 s:GameState;now=1000;
 constructor(){this.s=initialState(content,testCodes());this.run({type:'hidden17.enable'});for(const roleKey of this.s.roster)this.run({type:'player.setPresent',roleKey,present:true});this.run({type:'session.open'});this.run({type:'fair.enable'});}
 try(c:Command,a:Actor=gm){return execute(this.s,content,c,{now:this.now,actor:a,newId:()=>`cf${++uid}`,random:()=>.5});}
 run(c:Command,a:Actor=gm){const r=this.try(c,a);if(!r.ok)throw Error(`${c.type}: ${r.error} ${r.detail}`);this.s=r.state;return r;}
 as(k:string,c:Command){return this.run(c,player(k));}
 item(k:string,kind:ItemKind,ref:string=kind){const id=`fixture${++uid}`;this.s.items[id]={id,kind,ref,owner:{type:'player',key:k}};return id;}
 shard(ref:string){return Object.values(this.s.items).find(i=>i.kind==='shard'&&i.ref===ref)!;}
 prep(k:string,method:'salt'|'sign'|'vessel'){this.run({type:'hidden17.learn',player:k,method});const id=this.item(k,method==='sign'?'focus':'potion');this.as(k,{type:'hidden17.prepare',method,itemId:id});return Object.keys(this.s.hidden17!.prepared).at(-1)!;}
 admit(k:string){this.as(k,{type:'story.request',title:'Прогулка',text:'Иду во двор к условленному времени.',stake:''});const req=Object.values(this.s.story!.requests).at(-1)!;this.run({type:'fair.admit',player:k,requestId:req.id,at:this.now});return req.id;}
 start(){for(const k of ['o1','o5','o9','o6'])this.admit(k);this.run({type:'hidden17.ritual.start'});}
 choices(){this.start();for(const ref of ['I','II','III']){const i=this.shard(ref);this.as((i.owner as {key:string}).key,{type:'hidden17.ritual.offer',itemId:i.id,include:true});}for(let j=0;j<2;j++)this.as('o1',{type:'hidden17.ritual.offer',itemId:this.item('o1','focus'),include:true});this.run({type:'hidden17.ritual.powder'});this.as('o5',{type:'hidden17.ritual.formula',text:source.ritual.formula});}
 scene(k='o1',ref='I'){const saltId=this.prep(k,'salt');this.as(k,{type:'fair.destroy.request',itemId:this.shard(ref).id,saltId});return Object.values(this.s.hidden17!.fair!.destruction).at(-1)!;}
 pv(k:string){const v=viewFor(this.s,content,player(k),this.now);if(v.kind!=='player')throw Error('view');return v;}
}
test('непрерывные события не меняют фазу и не публикуют заявки',()=>{const g=new Game();expect(g.try({type:'act.next'}).ok).toBe(false);const phase=g.s.phase;g.s.players.o1.abilityUsedInAct=true;g.run({type:'fair.refresh'});expect(g.s.players.o1.abilityUsedInAct).toBe(false);expect(g.s.phase).toBe(phase);g.run({type:'fair.refresh'});expect(g.try({type:'fair.refresh'}).ok).toBe(false);const ash=g.s.workshop.ash;g.run({type:'fair.resupply'});expect(g.s.workshop.ash).toBe(ash+3);g.run({type:'fair.auction'});expect(Object.values(g.s.lots).some(l=>l.items.map(id=>g.s.items[id].ref).join(',')==='IV,A')).toBe(true);expect(g.try({type:'fair.auction'}).ok).toBe(false);});
test('заявка разрушения скрыта, запуск тратит соль, отмена до запуска возвращает резерв',()=>{const g=new Game();const a=g.scene();expect(g.pv('o2').hidden17!.fair!.scenes).toEqual([]);expect(g.s.items[a.saltId]).toBeTruthy();g.as('o1',{type:'fair.destroy.cancel',id:a.id});expect(g.s.items[a.saltId].reservedFor).toBeUndefined();const b=g.scene();g.run({type:'fair.destroy.start',id:b.id});expect(g.s.items[b.saltId]).toBeUndefined();expect(g.pv('o2').hidden17!.fair!.scenes.some(x=>x.id===b.id)).toBe(true);expect(g.try({type:'fair.destroy.resolve',id:b.id}).ok).toBe(false);});
test('первый талисман спасает, второй не тратится; повторная соль нужна заново',()=>{const g=new Game();const a=g.scene();g.run({type:'fair.destroy.start',id:a.id});const w=g.item('o2','ward'),w2=g.item('o3','ward');g.as('o2',{type:'fair.destroy.ward',id:a.id,itemId:w});expect(g.s.items[w]).toBeUndefined();expect(g.try({type:'fair.destroy.ward',id:a.id,itemId:w2},player('o3')).ok).toBe(false);expect(g.s.items[w2]).toBeTruthy();expect(g.s.items[a.targetId].owner).toEqual({type:'player',key:'o1'});expect(g.s.items[a.targetId].reservedFor).toBeUndefined();expect(g.s.hidden17!.ritual.extinguished).toEqual([]);});
test('автор может отказаться после запуска, соль не возвращается',()=>{const g=new Game();const a=g.scene();g.run({type:'fair.destroy.start',id:a.id});g.as('o1',{type:'fair.destroy.cancel',id:a.id});expect(g.s.items[a.saltId]).toBeUndefined();expect(g.s.items[a.targetId]).toBeTruthy();expect(g.s.items[a.targetId].reservedFor).toBeUndefined();});
test('один владелец может уничтожить три осколка до обряда',()=>{const g=new Game();for(const ref of ['I','II','III']){g.shard(ref).owner={type:'player',key:'o1'};const a=g.scene('o1',ref);g.run({type:'fair.destroy.start',id:a.id});g.now+=120000;g.run({type:'fair.destroy.resolve',id:a.id});expect(g.s.items[a.targetId]).toBeUndefined();}expect(g.s.hidden17!.ritual.extinguished).toEqual(['I','II','III']);g.run({type:'fair.finish'});expect(g.s.hidden17!.ritual.outcome!.life).toBe('destroyed');});
test('нельзя разрушить показанный или зарезервированный чужой предмет',()=>{const g=new Game();const salt=g.prep('o2','salt');expect(g.try({type:'fair.destroy.request',itemId:g.shard('I').id,saltId:salt},player('o2')).ok).toBe(false);const id=g.shard('I').id;g.s.items[id].reservedFor='trade';expect(g.try({type:'fair.destroy.request',itemId:id,saltId:g.prep('o1','salt')},player('o1')).ok).toBe(false);});
test('пауза не съедает окно спасения',()=>{const g=new Game();const a=g.scene();g.run({type:'fair.destroy.start',id:a.id});g.now+=1000;g.run({type:'clock.pause'});g.now+=200000;expect(g.try({type:'fair.destroy.resolve',id:a.id}).ok).toBe(false);g.run({type:'clock.resume'});expect(g.s.hidden17!.fair!.destruction[a.id].endsAt).toBe(321000);expect(g.try({type:'fair.destroy.resolve',id:a.id}).ok).toBe(false);});
test('допуск по собственной обычной заявке, секретен до замыкания; поздний вход запрещён',()=>{const g=new Game();const req=g.admit('o5');expect(g.pv('o2').hidden17!.fair!.admission).toBeUndefined();expect(g.try({type:'fair.admit',player:'o2',requestId:req,at:g.now}).ok).toBe(false);g.admit('o1');g.run({type:'hidden17.ritual.start'});expect(g.pv('o2').hidden17!.fair!.canParticipate).toBe(false);expect(g.pv('o5').hidden17!.fair!.canParticipate).toBe(true);expect(g.try({type:'fair.admit',player:'o5',requestId:req,at:g.now}).ok).toBe(false);expect(g.try({type:'hidden17.ritual.offer',itemId:g.shard('III').id,include:true},player('o9')).ok).toBe(false);});
test('бутылёк хранит донора, передача не меняет его, заранее приказ не нужен',()=>{const g=new Game();const blood=g.prep('o5','sign');expect(g.s.hidden17!.prepared[blood]).toEqual({method:'sign',controller:'o5'});g.s.items[blood].owner={type:'player',key:'o1'};g.choices();g.as('o1',{type:'hidden17.ritual.choice',kind:'sign',itemId:blood});g.run({type:'hidden17.ritual.reveal'});g.run({type:'hidden17.ritual.resolve'});g.run({type:'hidden17.ritual.finish'});expect(g.s.hidden17!.ritual.outcome).toMatchObject({life:'awake',freedom:'controlled',controller:'o5'});expect(g.s.hidden17!.ritual.outcome!.order).toBeUndefined();});
test('несколько расходников у одного участника, зритель не видит выбор и не защищает',()=>{const g=new Game();const salts=[g.prep('o1','salt'),g.prep('o1','salt')];const ward=g.item('o2','ward');g.choices();for(let i=0;i<2;i++)g.as('o1',{type:'hidden17.ritual.choice',kind:'salt',itemId:salts[i],targetId:g.shard(i?'II':'III').id});expect(g.pv('o1').hidden17!.ritual.myChoices).toHaveLength(2);expect(g.pv('o2').hidden17!.ritual.interventions).toEqual([]);expect(g.pv('o2').hidden17!.ritual.myChoices).toEqual([]);g.run({type:'hidden17.ritual.reveal'});const id=Object.keys(g.s.hidden17!.ritual.choices)[0];expect(g.try({type:'hidden17.ritual.ward',itemId:ward,against:id},player('o2')).ok).toBe(false);g.run({type:'hidden17.ritual.resolve'});expect(g.s.hidden17!.ritual.extinguished).toHaveLength(2);});
test('без состоявшегося обряда вечер можно завершить сном',()=>{const g=new Game();g.run({type:'fair.finish'});g.run({type:'session.close'});expect(g.s.phase).toBe('closed');});
test('кровь разных доноров срывает подчинение; одинаковый донор даёт один приказ',()=>{
 for(const second of ['o5','o17']){const g=new Game();const bloods=[g.prep('o5','sign'),g.prep(second,'sign')];for(const id of bloods)g.s.items[id].owner={type:'player',key:'o1'};g.choices();for(const itemId of bloods)g.as('o1',{type:'hidden17.ritual.choice',kind:'sign',itemId});g.run({type:'hidden17.ritual.reveal'});g.run({type:'hidden17.ritual.resolve'});g.run({type:'hidden17.ritual.finish'});expect(g.s.hidden17!.ritual.outcome!.freedom).toBe(second==='o5'?'controlled':'free');}
});
test('нельзя подменить донора, войти по будущей/отменённой заявке или произнести неизвестную формулу',()=>{
 const g=new Game();const focus=g.item('o5','focus');expect(g.try({type:'hidden17.prepare',method:'sign',itemId:focus,controller:'o1'},player('o5')).ok).toBe(false);expect(g.s.items[focus]).toBeTruthy();
 const req=g.admit('o2');g.run({type:'fair.admit',player:'o2',requestId:req,at:g.now+60000});g.admit('o5');g.run({type:'hidden17.ritual.start'});expect(g.s.hidden17!.fair!.participants).toEqual(['o5']);
 const g2=new Game();const rq=g2.admit('o5');const q=g2.s.story!.requests[rq];g2.as('o5',{type:'story.cancel',id:rq,revision:q.revision});expect(g2.try({type:'hidden17.ritual.start'}).ok).toBe(false);
});
test('уничтоженные в круге осколки исчезают из сумки, сведения о попытке остаются',()=>{
 const g=new Game();const salt=g.prep('o1','salt');g.choices();const id=g.shard('II').id;g.as('o1',{type:'hidden17.ritual.choice',kind:'salt',itemId:salt,targetId:id});g.run({type:'hidden17.ritual.reveal'});g.run({type:'hidden17.ritual.resolve'});expect(g.s.items[id]).toBeUndefined();expect(g.pv('o5').me.items.some(i=>i.id===id)).toBe(false);expect(g.pv('o2').hidden17!.knownItems[id]).toMatchObject({kind:'shard',ref:'II'});
});
test('завершение без обряда закрывает торг и возвращает резервы, эпилог доступен',()=>{
 const g=new Game();g.run({type:'fair.auction'});const lot=Object.values(g.s.lots).find(l=>l.status==='announced')!;g.run({type:'lot.sealedBids',id:lot.id});g.as('o1',{type:'lot.bid',id:lot.id,amount:2});
 g.as('o1',{type:'narrative.trade.create',to:'o2',give:{gold:1,ingredients:{ash:0,moon:0,dew:0},items:[]},wish:''});
 expect(g.s.players.o1.reservedGold).toBe(3);g.run({type:'fair.finish'});expect(g.s.players.o1.reservedGold).toBe(0);expect(g.s.lots[lot.id].status).toBe('unsold');g.run({type:'session.close'});expect(g.s.phase).toBe('closed');
});
test('лоты отсутствующих доступны без актов, при миграции сохраняют id и вещи',()=>{
 const g=new Game();const id='fallback';g.s.lots[id]={id,items:[],act:2,status:'queued',bids:[]};delete g.s.hidden17!.fair;g.run({type:'fair.enable'});expect(g.s.lots[id]).toMatchObject({id,status:'announced',act:1});g.run({type:'lot.openBidding',id});
 const c={...content,hidden17:{...source,continuousFair:true}};let s=initialState(c,testCodes());for(const command of [{type:'hidden17.enable'},{type:'player.setPresent',roleKey:'o1',present:true},{type:'session.open'}] as Command[]){const r=execute(s,c,command,{now:0,actor:gm,newId:()=>`absent${++uid}`,random:()=>.5});if(!r.ok)throw Error(r.error);s=r.state;}
 expect(Object.values(s.lots).length).toBeGreaterThan(5);expect(Object.values(s.lots).every(l=>l.status==='announced'&&l.act===1)).toBe(true);
});
test('отзыв из соединения не выносит уже показанный осколок из закрытой сцены',()=>{
 const g=new Game();const salt=g.prep('o1','salt');g.choices();const id=g.shard('II').id;
 g.as('o1',{type:'hidden17.ritual.choice',kind:'salt',itemId:salt,targetId:id});g.as('o5',{type:'hidden17.ritual.choice',kind:'withdraw',shardIds:[id]});g.run({type:'hidden17.ritual.reveal'});
 expect(g.s.hidden17!.ritual.circle).not.toContain(id);expect(Object.values(g.s.hidden17!.ritual.choices).find(c=>c.kind==='salt')!.status).toBe('active');
 expect(g.pv('o1').hidden17!.ritual.accessibleShards).toContain(id);g.run({type:'hidden17.ritual.resolve'});expect(g.s.hidden17!.ritual.extinguished).toContain('II');expect(g.s.items[salt]).toBeUndefined();
});
test('обновление сил не позволяет отменой старой правки воскресить временную способность',()=>{
 const g=new Game();const card={kind:'ability' as const,owner:'o1',title:'Тень',text:'Временный дар',price:'',visibility:'private' as const,readers:[],uses:1,duration:'act' as const,replacesAbility:true,active:true,completed:false};
 g.run({type:'story.card.save',card});const c=Object.values(g.s.story!.cards)[0];g.run({type:'story.card.save',id:c.id,revision:c.revision,card:{...card,text:'Уточнённый дар',active:false}});const edit=g.s.story!.history.at(-1)!;
 g.run({type:'fair.refresh'});expect(g.s.story!.cards[c.id].active).toBe(false);expect(g.try({type:'story.undo',id:edit.id}).ok).toBe(false);expect(g.pv('o1').me.ability.state).toBe('available');
});

test('отметка донора видна на предъявленном бутыле и в сделке, сохраняется после передачи',()=>{
 const g=new Game(), id=g.prep('o5','sign');
 expect(g.pv('o1').hidden17!.knownItems[id]).toBeUndefined();
 g.as('o5',{type:'hidden17.present',itemId:id,player:'o1',allow:true});
 expect(g.pv('o1').hidden17!.knownItems[id]).toMatchObject({ref:'blood-vial',bloodDonor:'o5'});
 expect(g.pv('o1').hidden17!.prepared[id]).toBeUndefined();
 g.as('o5',{type:'narrative.trade.create',to:'o2',give:bundle({items:[id]}),wish:''});
 const trade=Object.values(g.s.hidden17!.narrative!.trades).at(-1)!;
 expect(g.pv('o2').hidden17!.narrative!.trades[0].items[id]).toMatchObject({ref:'blood-vial',bloodDonor:'o5'});
 expect(g.pv('o3').hidden17!.knownItems[id]).toBeUndefined();
 g.as('o2',{type:'narrative.trade.reply',id:trade.id,give:bundle()});
 g.as('o5',{type:'narrative.trade.confirm',id:trade.id});
 expect(g.pv('o2').hidden17!.knownItems[id]).toMatchObject({owner:'o2',bloodDonor:'o5'});
 expect(g.pv('o5').hidden17!.narrative!.trades[0].items[id]).toMatchObject({bloodDonor:'o5'});
});
