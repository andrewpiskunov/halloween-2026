import { chmodSync, existsSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { checkInvariants, initialState, loadContent, reduce, type Event } from '@fair/shared';
import { loadConfig } from './config';
import { attachHiddenScenario } from './scenario';
import { EventStore } from './store';
import { repairMigrationKnowledge } from './repair-migration';

// Запускать --apply только при остановленном игровом сервере. По умолчанию — просмотр без записи.
const args=process.argv.slice(2);
const arg=(name:string)=>args[args.indexOf(name)+1];
if(!args.includes('--expected-seq')||!/^\d+$/.test(arg('--expected-seq')??''))throw new Error('Требуется --expected-seq N');
const expected=Number(arg('--expected-seq')),apply=args.includes('--apply');
const backup=args.includes('--backup')?arg('--backup'):undefined;
if(apply&&(!args.includes('--server-stopped')||!backup||backup.startsWith('--')))throw new Error('Для записи остановите сервер и укажите --server-stopped --backup PATH');
if(apply&&existsSync(backup!))throw new Error('Файл резервной копии уже существует');
const config=loadConfig();
const patch=config.contentPatchPath?JSON.parse(readFileSync(config.contentPatchPath,'utf8')):undefined;
const content=attachHiddenScenario(loadContent(JSON.parse(readFileSync(config.contentPath,'utf8')),patch),process.env.HIDDEN_SCENARIO_PATH||undefined);
const db=new Database(config.dbPath,{readonly:true});
try {
  const events=(db.prepare('SELECT seq,body FROM events ORDER BY seq').all() as {seq:number;body:string}[]).map(r=>({...JSON.parse(r.body),seq:r.seq}) as Event);
  const seq=events.at(-1)?.seq??0;
  if(seq!==expected)throw new Error('Журнал изменился: остановлено без исправлений');
  const result=repairMigrationKnowledge(events,content,Date.now());
  if(!result){console.log(JSON.stringify({changed:false,seq}));}
  else {
    const before=events.reduce((s,e)=>reduce(s,content,e),initialState(content,{}));
    const after=reduce(before,content,{...result.event,seq:seq+1});checkInvariants(after);
    const expectedState=structuredClone(before);
    expectedState.seq=after.seq;
    expectedState.hidden17!.narrative!.knowledge=after.hidden17!.narrative!.knowledge;
    expectedState.hidden17!.narrative!.announcements=after.hidden17!.narrative!.announcements;
    assert.deepEqual(after,expectedState,'Исправление затронуло другие данные партии');
    console.log(JSON.stringify({mode:apply?'apply':'dry-run',seq,removedJoining:result.removed,retainedJoining:Object.entries(after.hidden17!.narrative!.knowledge).filter(([,v])=>v.includes('joining')).map(([k])=>k)}));
    if(apply){
      await db.backup(backup!);chmodSync(backup!,0o600);
      const store=new EventStore(config.dbPath);
      try {if(store.all().at(-1)?.seq!==expected)throw new Error('Журнал изменился после проверки');store.append([result.event]);console.log(JSON.stringify({changed:true,seq:seq+1}));}
      finally {store.close();}
    }
  }
}finally{db.close();}
