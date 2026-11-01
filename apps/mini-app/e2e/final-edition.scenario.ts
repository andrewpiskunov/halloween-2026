import {expect,test,type Page} from '@playwright/test';
async function state(p:Page):Promise<any>{return p.evaluate(async()=>{
 // @ts-ignore Vite dev module
 return (await import('/src/store.ts')).view.value;
});}
async function command(p:Page,c:object){return p.evaluate(async c=>{
 // @ts-ignore Vite dev module
 return (await import('/src/store.ts')).run(c);
},c);}
async function cmd(p:Page,c:object){expect(await command(p,c),JSON.stringify(c)).toMatchObject({ok:true});}
const nav=(p:Page,name:string)=>p.locator('nav.tabs').getByRole('button',{name,exact:true}).click();
const confirm=(p:Page,name:string)=>p.getByRole('dialog').getByRole('button',{name,exact:true}).click();
async function pick(p:Page,label:string,option:string){await p.getByRole('combobox',{name:label,exact:true}).click();await p.getByRole('option',{name:option,exact:true}).click();}
async function shot(p:Page,path:string){await p.evaluate(()=>document.fonts.ready);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path,fullPage:true});}

test('редакция2: тихий допуск, подготовка, групповой щит и однократная помощь через формы',async({browser,request},info)=>{
 test.setTimeout(180000);const gm=await browser.newPage({viewport:{width:390,height:844}}),players:Record<string,Page>={};
 try{
 const codes=await(await request.get('http://localhost:8096/api/dev/codes')).json();
 await gm.goto(`/?dev=9100&code=${codes.gm}`);await expect.poll(async()=>(await state(gm))?.kind).toBe('gm');
 for(const k of ['o1','o5','o9','o6','o10','o2','o3','o16'])await cmd(gm,{type:'player.setPresent',roleKey:k,present:true});
 await cmd(gm,{type:'session.open'});
 for(const k of ['o1','o5','o9','o6','o10','o2','o3','o16']){
  const p=players[k]=await browser.newPage({viewport:{width:390,height:844}});await p.goto(`/?dev=${9200+Number(k.slice(1))}&code=${codes.roles[k]}`);await expect.poll(async()=>(await state(p))?.kind).toBe('player');expect((await state(p)).me.player.gold).toBe(8);
 }
 const v=players.o5,a=players.o1,ada=players.o10,greta=players.o6,watch=players.o2;
 for(const key of ['o1','o5','o9','o6','o10','o16']){
  for(const ingredient of ['ash','moon','dew'])await cmd(gm,{type:'gm.correct',playerKey:key,change:{field:'ingredient',ingredient,delta:12},reason:'Вымышленная проверка финала'});
  await cmd(gm,{type:'gm.correct',playerKey:key,change:{field:'gold',delta:30},reason:'Вымышленная проверка финала'});
 }
 // Два перехода копии через настоящую форму, без раскрытия чужих документов зрителю.
 const doc=(await state(v)).hidden17.narrative.documents.find((d:any)=>d.id==='velda-joining');
 for(const [from,to,key] of [[v,a,'o1'],[a,ada,'o10']] as const){
  await nav(from,'Сумка');await from.locator('.narrative-document-link').filter({hasText:doc.title}).click();await pick(from,'Кому показать документ',(await state(to)).me.role.name);await from.getByRole('button',{name:'Показать',exact:true}).click();await confirm(from,'Показать');await expect.poll(async()=>(await state(to)).hidden17.narrative.documents.some((d:any)=>d.id===doc.id)).toBe(true);await expect(from.getByRole('button',{name:'Забрать документ',exact:true})).toHaveCount(0);
 }
 expect(JSON.stringify(await state(watch))).not.toContain(doc.text);
 // Устная память не предлагает неработающую отправку документа.
 await cmd(gm,{type:'narrative.knowledge',player:'o2',knowledge:'joining'});await nav(watch,'Сумка');await watch.locator('.narrative-document-link').filter({hasText:'Запись услышанного обряда'}).click();await expect(watch.getByRole('combobox',{name:'Кому показать документ',exact:true})).toHaveCount(0);await expect(watch.getByText('Вы узнали об этом в разговоре.',{exact:false})).toBeVisible();
 // Линза: предъявленный компонент, согласие текущего владельца и автоматический ответ.
 await cmd(ada,{type:'shop.craft',recipeId:'cleanse'});await nav(ada,'Мастерская');await ada.getByRole('button',{name:'Приготовить разрывную соль',exact:true}).click();await confirm(ada,'Подготовить');await expect(ada.getByRole('status')).toContainText('Готово: Разрывная соль');
 const salt=(await state(ada)).me.items.find((i:any)=>i.ref==='salt');await cmd(ada,{type:'hidden17.present',itemId:salt.id,player:'o16',allow:true});await cmd(players.o16,{type:'hidden17.signature.craft',recipeId:'inspection-lens'});
 await nav(players.o16,'Сумка');await players.o16.locator('.narrative-slot').filter({hasText:'Осмотровая линза'}).click();await players.o16.getByText('Применить: Осмотровая линза',{exact:true}).click();await pick(players.o16,'Цель особого изделия','Ада');await pick(players.o16,'Вопрос линзы','Для чего подготовлен компонент?');await expect(players.o16.getByRole('combobox',{name:'Предъявленная реликвия',exact:true})).toContainText('Разрывная соль');await players.o16.getByRole('button',{name:'Применить с согласия',exact:true}).click();await confirm(players.o16,'Предложить применение');
 await nav(ada,'Сумка');await ada.getByRole('button',{name:'Согласиться',exact:true}).click();await expect.poll(async()=>(await state(players.o16)).hidden17.uses[0]?.status).toBe('completed');await nav(players.o16,'Сумка');await expect(players.o16.getByText('Предъявленная вещь: Разрывная соль',{exact:true})).toBeVisible();
 // Предварительные вклады и допуск с будущим временем; отменённая заявка не оживает по часам.
 for(const key of ['o1','o5','o9','o6','o10','o3']){
  await cmd(players[key],{type:'story.request',title:'Приход к заставе',text:'Лично прихожу к плите',stake:''});const q=Object.values((await state(gm)).state.story.requests).filter((q:any)=>q.author===key).at(-1) as any;await cmd(gm,{type:'fair.admit',player:key,requestId:q.id,at:Date.now()+(key==='o1'||key==='o3'?10000:-1000)});
  if(key==='o3')await cmd(players[key],{type:'story.cancel',id:q.id,revision:q.revision});
 }
 expect((await state(a)).hidden17.fair.canParticipate).toBe(false);
 let advanced=await(await request.post('http://localhost:8096/__test/time',{data:{ms:10001}})).json();
 for(const p of [gm,...Object.values(players)])await p.clock.setFixedTime(advanced.now);
 await expect.poll(async()=>(await state(a)).hidden17.fair.canParticipate).toBe(true);expect((await state(players.o3)).hidden17.fair.canParticipate).toBe(false);
 for(const p of [a,v,players.o9]){await nav(p,'Застава');await p.getByRole('button',{name:'Положить',exact:true}).first().click();await confirm(p,'Положить');}
 for(let n=0;n<2;n++)await cmd(v,{type:'hidden17.produce',recipeId:'focus'});
 await nav(v,'Застава');for(let n=0;n<2;n++){await v.getByRole('button',{name:'Положить',exact:true}).first().click();await confirm(v,'Положить');await expect.poll(async()=>(await state(v)).hidden17.ritual.focuses.length).toBe(n+1);}
 // Ещё одна соль, сосуд и два источника защиты.
 await cmd(ada,{type:'shop.craft',recipeId:'cleanse'});await nav(ada,'Мастерская');await ada.getByRole('button',{name:'Приготовить разрывную соль',exact:true}).click();await confirm(ada,'Подготовить');
 await cmd(gm,{type:'hidden17.learn',player:'o6',method:'vessel'});await cmd(greta,{type:'shop.craft',recipeId:'cleanse'});await nav(greta,'Мастерская');await greta.getByRole('button',{name:'Подготовить отводящий сосуд',exact:true}).click();await confirm(greta,'Подготовить');
 await cmd(v,{type:'shop.craft',recipeId:'ward'});await cmd(gm,{type:'gm.correct',playerKey:'o5',change:{field:'protection',value:true},reason:'Вымышленная активная защита'});
 await nav(gm,'Ритуал');await gm.getByRole('button',{name:'Объявить последние пять минут',exact:true}).click();await confirm(gm,'Объявить');await expect(gm.getByRole('button',{name:'1 · Начать сборку',exact:true})).toBeDisabled();
 await gm.getByRole('button',{name:'Отменить предупреждение',exact:true}).click();expect((await state(gm)).state.hidden17.fair.ritualAnnouncement).toBeUndefined();await gm.getByRole('button',{name:'Объявить последние пять минут',exact:true}).click();await confirm(gm,'Объявить');
 // Отказ сервера без ресурса атомарен; кнопка UI остаётся заблокирована.
 const focus=(await state(v)).hidden17.ritual.focuses[0];await cmd(v,{type:'hidden17.ritual.offer',itemId:focus,include:false});
 advanced=await(await request.post('http://localhost:8096/__test/time',{data:{ms:300001}})).json();for(const p of [gm,...Object.values(players)])await p.clock.setFixedTime(advanced.now);
 expect(await command(gm,{type:'hidden17.ritual.start'})).toMatchObject({ok:false});expect((await state(gm)).state.hidden17.ritual.step).toBe('preparation');await cmd(a,{type:'shop.buy',ingredient:'ash',count:1});
 await nav(v,'Застава');await v.getByRole('button',{name:'Положить',exact:true}).first().click();await confirm(v,'Положить');
 await expect(gm.getByRole('button',{name:'1 · Начать сборку',exact:true})).toBeEnabled();
 const spectator=await state(players.o3);expect(spectator.hidden17.fair.participants).toEqual([]);expect(spectator.hidden17.ritual.circle).toEqual([]);expect(spectator.hidden17.ritual.focuses).toEqual([]);expect(spectator).not.toHaveProperty('finalRitualReadiness');expect(JSON.stringify(spectator)).not.toContain(doc.text);
 await shot(gm,info.outputPath('ready-390.png'));await gm.getByRole('button',{name:'1 · Начать сборку',exact:true}).click();await confirm(gm,'Собрать у могилы');
 await gm.getByRole('button',{name:'2 · Рассыпать пыль',exact:true}).click();await confirm(gm,'2 · Первый удар');await nav(v,'Застава');await v.getByRole('button',{name:'Формула произнесена',exact:true}).click();
 const target=(await state(a)).me.items.find((i:any)=>i.kind==='shard').id;
 // Сами варианты доступны в UI; два компонента одной группы отправлены последовательно.
 await nav(ada,'Застава');await pick(ada,'Действие в ритуале','Разрывная соль');
 for(let n=0;n<2;n++){await pick(ada,'Цель соли','Осколок I');await ada.getByRole('button',{name:'Сохранить скрытый выбор',exact:true}).click();}
 await nav(greta,'Застава');await pick(greta,'Действие в ритуале','Отводящий сосуд');await greta.getByRole('button',{name:'Сохранить скрытый выбор',exact:true}).click();
 await gm.getByRole('button',{name:'3 · Раскрыть выбор',exact:true}).click();await confirm(gm,'3 · Раскрыть');await nav(v,'Застава');await pick(v,'Талисман для ответа','Активная личная защита');await v.getByRole('button',{name:'Выбрать защиту группы',exact:true}).first().click();await confirm(v,'Выбрать защиту');
 expect((await state(v)).hidden17.ritual.myWard.source).toBe('protection');await v.setViewportSize({width:320,height:844});await shot(v,info.outputPath('group-ward-320.png'));
 await gm.getByRole('button',{name:'Применить ответы и эффекты',exact:true}).click();await confirm(gm,'Применить эффекты');
 const after=(await state(gm)).state;expect(Object.values(after.hidden17.ritual.choices).filter((c:any)=>c.kind==='salt').map((c:any)=>c.status)).toEqual(['blocked','blocked']);expect(after.players.o5.protection).toBeUndefined();expect(Object.values(after.items).some((i:any)=>i.kind==='ward'&&i.owner.key==='o5')).toBe(true);
 await gm.getByRole('button',{name:'4 · Завершить ритуал',exact:true}).click();await confirm(gm,'4 · Последний удар');await nav(gm,'Итоги');await pick(gm,'Большая помощь','Оживить семя');await pick(gm,'Получатель большой помощи','Брам');await gm.getByRole('textbox',{name:'Пояснение большой помощи',exact:true}).fill('Сарн выбрал просьбу Брама; семя ожило.');await gm.getByRole('button',{name:'Зафиксировать большую помощь',exact:true}).click();await confirm(gm,'Зафиксировать помощь');await expect(gm.getByRole('button',{name:'Зафиксировать большую помощь',exact:true})).toHaveCount(0);
 expect(await command(gm,{type:'fair.help.resolve',effect:'fort',beneficiary:'o9',mode:'free',note:'Второе чудо'})).toMatchObject({ok:false});
 await pick(gm,'Владелец полной порции','Грета');await pick(gm,'Применение полной порции','Зарядить новый Фокус');await gm.getByRole('textbox',{name:'Пояснение порции',exact:true}).fill('Грета согласилась зарядить Фокус из полной порции.');await gm.getByRole('button',{name:'Использовать полную порцию',exact:true}).click();await confirm(gm,'Использовать порцию');await expect(gm.getByRole('button',{name:'Использовать полную порцию',exact:true})).toHaveCount(0);await shot(gm,info.outputPath('epilogue-390.png'));
 await gm.getByRole('button',{name:'Зафиксировать итоги',exact:true}).click();await confirm(gm,'Закрыть ярмарку');await gm.getByRole('button',{name:'Показать игрокам их итоги',exact:true}).click();
 await nav(watch,'Итоги');await expect(watch.getByText('Сарн выбрал просьбу Брама; семя ожило.',{exact:false})).toBeVisible();
 }finally{await gm.close();for(const p of Object.values(players))await p.close();}
});
