import { expect, test, type Page } from '@playwright/test';
async function state(page: Page): Promise<any> {
 return page.evaluate(async () => {
  // @ts-ignore Модуль Vite при браузерном прогоне.
  return (await import('/src/store.ts')).view.value;
 });
}
async function cmd(page: Page, command: object) {
 const result = await page.evaluate(async command => {
  // @ts-ignore Модуль Vite при браузерном прогоне.
  return (await import('/src/store.ts')).run(command);
 }, command);
 expect(result, JSON.stringify(command)).toMatchObject({ok:true});
}
const nav = (page: Page, name: string) => page.locator('nav.tabs').getByRole('button', { name, exact: true }).click();
const confirm = (page: Page, name: string) => page.getByRole('dialog').getByRole('button', {name,exact:true}).click();
async function screen(page: Page, name: string) {
 if (await page.getByRole('alert').isVisible()) await page.getByRole('alert').click();
 await page.evaluate(() => { window.scrollTo(0,0); return document.fonts.ready; });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
 const broken = await page.locator('img:visible').evaluateAll(async images => {
  await Promise.all(images.map(i => (i as HTMLImageElement).decode().catch(() => undefined)));
  return images.filter(i => !(i as HTMLImageElement).naturalWidth).map(i => i.getAttribute('src'));
 });
 expect(broken, name).toEqual([]);
}

test('ведущий: очередь, досье, послания и администрирование', async ({ browser, request }, info) => {
 test.setTimeout(180000);
 const gm = await browser.newPage({viewport:{width:390,height:844}});
 const codes = await (await request.get('http://localhost:8094/api/dev/codes')).json();
 const a = await browser.newPage({viewport:{width:390,height:844}});
 const b = await browser.newPage({viewport:{width:390,height:844}});
 try {
  await gm.goto(`/?dev=5100&code=${codes.gm}`);
  await expect.poll(async () => (await state(gm))?.kind).toBe('gm');
  const keys = (await state(gm)).state.roster;
  for (const roleKey of keys) await cmd(gm,{type:'player.setPresent',roleKey,present:true});
  await nav(gm,'Пульт');
  await gm.getByRole('button',{name:'Написать послание',exact:true}).click();
  await gm.getByRole('textbox',{name:'Заголовок послания',exact:true}).fill('До открытия');
  await gm.getByRole('textbox',{name:'Текст послания',exact:true}).fill('Собираемся у стола.');
  await gm.getByRole('button',{name:'Отправить послание',exact:true}).click(); await confirm(gm,'Отправить');
  await expect(gm.getByRole('alert')).toContainText('Объявление опубликовано');
  await cmd(gm,{type:'session.open'});
  await a.goto(`/?dev=5101&code=${codes.roles.o1}`);
  await b.goto(`/?dev=5102&code=${codes.roles.o2}`);
  await expect.poll(async () => (await state(a))?.kind).toBe('player');
  await expect.poll(async () => (await state(b))?.kind).toBe('player');
  const av = await state(a), name = av.me.role.name, otherName = (await state(b)).me.role.name;
  await expect(a.getByRole('heading',{name:'До открытия',exact:true})).toHaveCount(1);
  await expect(b.getByRole('heading',{name:'До открытия',exact:true})).toHaveCount(1);
  const shard = av.me.items.find((i:any)=>i.kind==='shard');
  const ingredient = Object.keys(av.me.available.ingredients).find(k=>av.me.available.ingredients[k]>0)!;
  await cmd(a,{type:'narrative.trade.create',to:'o2',give:{gold:2,ingredients:{ash:0,moon:0,dew:0,[ingredient]:1},items:[shard.id]},wish:'Проверка резервов'});
  await nav(gm,'Состав');
  await expect(gm.getByRole('button',{name:'Перевыдать код',exact:true})).toHaveCount(0);
  await gm.getByRole('button',{name:`Досье: ${name}`,exact:true}).click();
  await expect(gm.getByRole('heading',{name:`Досье · ${name}`,exact:true})).toBeVisible();
  const gold = gm.locator('[data-resource="gold"]');
  await expect(gold).toContainText(`Всего: ${av.me.player.gold} · свободно: ${av.me.player.gold-2}`);
  await expect(gm.locator(`[data-resource="${ingredient}"]`)).toContainText('В резерве: 1');
  await expect(gm.locator('.gm-dossier-item').filter({hasText:`Осколок ${shard.ref}`})).toContainText('В резерве');
  await expect(gm.getByText('Лист семейной книги',{exact:true})).toBeVisible();
  for(const width of [320,390,480]) {
   await gm.setViewportSize({width,height:844}); await screen(gm,`досье ${width}`);
   await gm.screenshot({path:info.outputPath(`dossier-${width}.png`),fullPage:true});
  }
  await gm.getByRole('combobox',{name:'Герой в досье',exact:true}).click();
  await gm.getByRole('option',{name:otherName,exact:true}).click();
  await expect(gm.getByRole('heading',{name:`Досье · ${otherName}`,exact:true})).toBeVisible();
  await expect(gm.getByText('Лист семейной книги',{exact:true})).toHaveCount(0);
  await cmd(gm,{type:'hidden17.learn',player:'o2',method:'sign'});
  await expect(gm.locator('.gm-dossier .list')).toContainText('Бутылёк крови');
  await gm.getByRole('combobox',{name:'Герой в досье',exact:true}).click();
  await gm.getByRole('option',{name:'Вельда',exact:true}).click();
  await expect(gm.locator('.gm-dossier .list')).toContainText('Бутылёк крови');
  await gm.getByRole('combobox',{name:'Герой в досье',exact:true}).click();
  await gm.getByRole('option',{name,exact:true}).click();
  await cmd(gm,{type:'gm.correct',playerKey:'o1',change:{field:'curse',value:true},reason:'Проверка досье'});
  await gm.getByRole('button',{name:'проклятие · исправить',exact:true}).click();
  await expect(gm.locator('.gm-dossier-correction')).toHaveJSProperty('open',true);
  await gm.locator('.gm-dossier-correction > summary').click();
  await expect(gm.locator('.gm-dossier-correction')).toHaveJSProperty('open',false);
  await gm.getByRole('button',{name:'проклятие · исправить',exact:true}).click();
  await expect(gm.locator('.gm-dossier-correction')).toHaveJSProperty('open',true);
  await expect(gm.locator('.gm-dossier-correction').getByRole('combobox',{name:'Игрок',exact:true})).toContainText(name);
  await gm.getByRole('textbox',{name:'Причина',exact:true}).fill('Снять тестовый эффект');
  await gm.getByRole('button',{name:'Исправить',exact:true}).click(); await confirm(gm,'Исправить');
  await expect.poll(async()=>(await state(gm)).state.players.o1.curse).toBe(false);
  const trade = (await state(a)).hidden17.narrative.trades.find((t:any)=>t.status==='offered');
  await cmd(a,{type:'narrative.trade.cancel',id:trade.id});
  await expect(gold).toContainText(`Всего: ${av.me.player.gold} · свободно: ${av.me.player.gold}`);

  // Очередь: новая заявка, карточка результата, условия, затем результат.
  await cmd(a,{type:'story.request',title:'Осматриваю каменную плиту',text:'Ищу следы старого погребения.',stake:''});
  await nav(gm,'Пульт');
  const queue = gm.getByRole('region',{name:'Очередь ведущего',exact:true});
  await cmd(gm,{type:'gm.correct',playerKey:'o1',change:{field:'curse',value:true},reason:'Повторное раскрытие исправления'});
  await gm.locator('.gm-abilities > details > summary').filter({hasText:'Отметки игроков'}).click();
  const curseMark = gm.locator('.gm-mark-row').filter({has:gm.getByText(name,{exact:true})}).getByRole('button',{name:'проклятие ×',exact:true});
  await curseMark.click();
  const correction = gm.locator('details.gm-fold').filter({has:gm.getByRole('heading',{name:'Исправление',exact:true,includeHidden:true})});
  await expect(correction).toHaveJSProperty('open',true);
  await correction.locator(':scope > summary').click();
  await expect(correction).toHaveJSProperty('open',false);
  await curseMark.click();
  await expect(correction).toHaveJSProperty('open',true);
  await cmd(gm,{type:'gm.correct',playerKey:'o1',change:{field:'curse',value:false},reason:'Проверка завершена'});
  await correction.locator(':scope > summary').click();
  await gm.locator('.gm-abilities > details > summary').filter({hasText:'Отметки игроков'}).click();
  await expect(gm.locator('nav.tabs').getByRole('button',{name:'Пульт',exact:true}).locator('.badge')).toHaveText('1');
  await expect(gm.locator('nav.tabs').getByRole('button',{name:'Сюжет',exact:true}).locator('.badge')).toHaveText('1');
  const q = Object.values((await state(gm)).state.story.requests).find((q:any)=>q.title==='Осматриваю каменную плиту') as any;
  const entry = queue.locator(`[data-attention-id="${q.id}"]`);
  for(const width of [320,390,480]) {
   await gm.setViewportSize({width,height:844}); await screen(gm,`очередь ${width}`);
   await gm.screenshot({path:info.outputPath(`queue-${width}.png`),fullPage:true});
  }
  await entry.locator('summary').first().click();
  await entry.getByRole('button',{name:'Создать результат-карточку',exact:true}).click();
  await expect(gm.getByRole('combobox',{name:'Владелец карточки',exact:true})).toContainText(name);
  await gm.getByRole('textbox',{name:'Название карточки',exact:true}).fill('Каменный оттиск');
  await gm.getByRole('textbox',{name:'Что действует: эффект, задача или условия договора',exact:true}).fill('След старого узора на глине.');
  await gm.getByRole('button',{name:'Сохранить карточку',exact:true}).click(); await confirm(gm,'Сохранить');
  await nav(gm,'Пульт'); await entry.locator('summary').first().click();
  await entry.getByRole('textbox',{name:'Условия или результат заявки',exact:true}).fill('Принесите свет.');
  await entry.getByRole('button',{name:'Предложить условия',exact:true}).click(); await confirm(gm,'Отправить');
  await expect(queue.locator('.gm-count')).toHaveText('0');
  await expect(gm.locator('nav.tabs .badge')).toHaveCount(0);
  await queue.locator('.gm-waiting > summary').click();
  await entry.locator('summary').first().click();
  await entry.getByRole('textbox',{name:'Условия или результат заявки',exact:true}).fill('Под светом видны следы погребения.');
  await entry.getByRole('button',{name:'Подтвердить результат',exact:true}).click(); await confirm(gm,'Отправить');
  await expect(entry).toHaveCount(0);
  await expect.poll(async()=>(await state(a)).story.requests.find((x:any)=>x.id===q.id)?.status).toBe('done');

  // Осмотр появляется среди дел ведущего только после согласия владельца.
  const c=await browser.newPage({viewport:{width:390,height:844}});
  try {
   await c.goto(`/?dev=5116&code=${codes.roles.o16}`);
   await expect.poll(async()=>(await state(c))?.kind).toBe('player');
   for(const resource of ['ash','moon']) await cmd(gm,{type:'gm.correct',playerKey:'o16',change:{field:'ingredient',ingredient:resource,delta:3},reason:'Проверка линзы'});
   await cmd(c,{type:'hidden17.signature.craft',recipeId:'inspection-lens'});
   const lens=(await state(c)).me.items.find((i:any)=>i.ref==='inspection-lens');
   const relic=Object.values((await state(gm)).state.items).find((i:any)=>i.kind==='relic') as any;
   await cmd(gm,{type:'gm.correct',playerKey:'o2',change:{field:'itemOwner',itemId:relic.id,owner:{type:'player',key:'o2'}},reason:'Проверка осмотра'});
   await cmd(b,{type:'hidden17.present',itemId:relic.id,player:'o16',allow:true});
   await cmd(c,{type:'hidden17.signature.use',itemId:lens.id,targets:['o2'],relicId:relic.id,question:'material'});
   const u=Object.values((await state(gm)).state.hidden17.uses).find((u:any)=>u.itemId===lens.id) as any;
   await expect(queue.locator('.gm-count')).toHaveText('0');
   await expect(queue.locator('.gm-waiting')).toContainText('Осмотр линзой');
   await cmd(b,{type:'hidden17.signature.respond',id:u.id,accept:true});
   await expect(queue.locator('.gm-count')).toHaveText('1');
   const inspection=queue.locator(`[data-attention-id="${u.id}"]`);
   await inspection.locator('summary').click();
   await inspection.getByRole('textbox',{name:'Физическое наблюдение',exact:true}).fill('Предмет отлит из меди.');
   await inspection.getByRole('button',{name:'Сообщить результат осмотра',exact:true}).click();
   await expect(inspection).toHaveCount(0);
  } finally {await c.close();}

  // Сцена разрушения доступна из очереди; отмена возвращает резерв.
  await cmd(gm,{type:'hidden17.learn',player:'o1',method:'salt'});
  for(const ingredient of ['ash','moon','dew'])await cmd(gm,{type:'gm.correct',playerKey:'o1',change:{field:'ingredient',ingredient,delta:3},reason:'Проверка сцены'});
  await cmd(a,{type:'shop.craft',recipeId:'cleanse'});
  const potion=(await state(a)).me.items.find((i:any)=>i.kind==='potion');
  await cmd(a,{type:'hidden17.prepare',method:'salt',itemId:potion.id});
  const salt=(await state(a)).me.items.find((i:any)=>i.ref==='salt');
  await cmd(a,{type:'fair.destroy.request',itemId:shard.id,saltId:salt.id});
  const scene=Object.values((await state(gm)).state.hidden17.fair.destruction)[0] as any;
  const sceneEntry=queue.locator(`[data-attention-id="${scene.id}"]`);
  await sceneEntry.locator('summary').click();
  await expect(sceneEntry.getByRole('button',{name:'Объявить сцену · 2 минуты',exact:true})).toBeEnabled();
  await sceneEntry.getByRole('button',{name:'Отменить сцену',exact:true}).click(); await confirm(gm,'Отменить');
  await expect(sceneEntry).toHaveCount(0);
  await expect(queue.locator('.gm-count')).toHaveText('0');
  await expect(gm.locator('.gm-journal-fold')).toHaveJSProperty('open',false);

  // Общая форма: личное скрыто от остальных, публичное видно ровно один раз.
  await gm.getByRole('button',{name:'Написать послание',exact:true}).click();
  await gm.getByRole('radio',{name:'Выбранным героям',exact:true}).check();
  await gm.getByRole('checkbox',{name,exact:true}).check();
  await gm.getByRole('textbox',{name:'Заголовок послания',exact:true}).fill('Личный знак');
  await gm.getByRole('textbox',{name:'Текст послания',exact:true}).fill('Только вы слышите звон серебра.');
  await gm.setViewportSize({width:320,height:844}); await screen(gm,'личное послание');
  await gm.screenshot({path:info.outputPath('message-320.png'),fullPage:true});
  await gm.getByRole('button',{name:'Отправить послание',exact:true}).click(); await confirm(gm,'Отправить');
  await expect(gm.getByRole('textbox',{name:'Текст послания',exact:true})).toHaveValue('');
  await expect(gm.getByRole('checkbox',{name,exact:true})).not.toBeChecked();
  await nav(a,'Таверна'); await nav(b,'Таверна');
  await expect(a.getByRole('heading',{name:'Личный знак',exact:true})).toHaveCount(1);
  await expect(b.getByRole('heading',{name:'Личный знак',exact:true})).toHaveCount(0);
  await gm.getByRole('radio',{name:'Всем на ярмарке',exact:true}).check();
  await gm.getByRole('textbox',{name:'Заголовок послания',exact:true}).fill('Общий колокол');
  await gm.getByRole('textbox',{name:'Текст послания',exact:true}).fill('Все слышат колокол у таверны.');
  await gm.getByRole('button',{name:'Отправить послание',exact:true}).click(); await confirm(gm,'Отправить');
  for(const p of [a,b]) {
   await expect(p.locator('.narrative-board').getByRole('heading',{name:'Общий колокол',exact:true})).toHaveCount(1);
   await expect(p.getByRole('heading',{name:'Общий колокол',exact:true})).toHaveCount(1);
  }
  await expect(b.locator('main')).not.toContainText('Только вы слышите звон серебра.');

  // Администрирование отделено, простое открытие не меняет состояние.
  await nav(gm,'Пульт');
  await expect(gm.getByRole('button',{name:'Сбросить игру',exact:true})).toHaveCount(0);
  await gm.getByRole('button',{name:'Администрирование',exact:true}).click();
  await screen(gm,'администрирование');
  await gm.getByRole('button',{name:'Сбросить игру',exact:true}).click(); await confirm(gm,'Отмена');
  expect((await state(gm)).state.phase).toBe('act1');
  const before=(await state(gm)).invites.find((i:any)=>i.roleKey==='o17').code;
  const lastName=await gm.evaluate(async()=>{
   // @ts-ignore Модуль Vite.
   return (await import('/src/store.ts')).loadedContent().roles.find((r:any)=>r.key==='o17').name;
  });
  await gm.getByRole('combobox',{name:'Герой для перевыдачи кода',exact:true}).click();
  await gm.getByRole('option',{name:lastName,exact:true}).click();
  await gm.getByRole('button',{name:'Перевыдать код',exact:true}).click(); await confirm(gm,'Перевыдать');
  await expect.poll(async()=>(await state(gm)).invites.find((i:any)=>i.roleKey==='o17').code).not.toBe(before);
  await screen(gm,'администрирование');
  await gm.screenshot({path:info.outputPath('administration-320.png'),fullPage:true});
  await nav(gm,'Состав');
  await expect(gm.getByRole('heading',{name:'Администрирование',exact:true})).toHaveCount(0);
  await gm.getByRole('button',{name:`Досье: ${name}`,exact:true}).click();
  await expect(gm.locator('.gm-dossier-card > summary').filter({hasText:'Каменный оттиск'})).toBeVisible();
  await expect(gm.locator('.gm-dossier-request')).toContainText('Исполнено');
 } finally { await a.close(); await b.close(); await gm.close(); }
});
