/** Только E2E entry: production index/http/ws не принимают управление временем. */
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadContent} from '../packages/shared/src/index';
import {loadConfig} from '../packages/server/src/config';
import {attachHiddenScenario} from '../packages/server/src/scenario';
import {EventStore} from '../packages/server/src/store';
import {Game} from '../packages/server/src/game';
import {buildApp} from '../packages/server/src/http';
import {attachWs} from '../packages/server/src/ws';
const config=loadConfig({...process.env,DB_PATH:':memory:',ALLOW_DEV_AUTH:'1',SESSION_SECRET:'e2e-only'},'/nonexistent');
const content=attachHiddenScenario(loadContent(JSON.parse(readFileSync(config.contentPath,'utf8'))));
const store=new EventStore(':memory:');let offset=0;const now=()=>Date.now()+offset;
const game=Game.open(store,content,{now,newId:randomUUID,random:()=>.5,hidden17:true});
const deps={game,store,content,config,now};const app=buildApp(deps);attachWs(app.server,deps);
app.post<{Body:{ms:number}}>('/__test/time',async(req,reply)=>{
 if(!Number.isSafeInteger(req.body?.ms)||req.body.ms<0)return reply.code(400).send({error:'ms'});
 offset+=req.body.ms;game.tick();return {now:now()};
});
setInterval(()=>game.tick(),1000).unref();
await app.listen({port:config.port,host:'127.0.0.1'});
