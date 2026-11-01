import { expect, test, type Page } from '@playwright/test';
async function state(page: Page): Promise<any> {
 return page.evaluate(async()=>{
  // @ts-ignore Модуль dev-сборки.
  return (await import('/src/store.ts')).view.value;
 });
}
async function cmd(page: Page, command: object) {
 const result=await page.evaluate(async command=>{
  // @ts-ignore Модуль dev-сборки.
  return (await import('/src/store.ts')).run(command);
 },command);
 expect(result,JSON.stringify(command)).toMatchObject({ok:true});
}
const nav=(p:Page,name:string)=>p.locator('nav.tabs').getByRole('button',{name,exact:true}).click();
test('бутылёк с отметкой Вельды: подготовка, показ и передача',async({browser,request},info)=>{
 const gm=await browser.newPage(),a=await browser.newPage({viewport:{width:390,height:844}}),b=await browser.newPage({viewport:{width:390,height:844}});
 try {
  const codes=await(await request.get('http://localhost:8094/api/dev/codes')).json();
  await gm.goto(`/?dev=6100&code=${codes.gm}`);
  await expect.poll(async()=>(await state(gm))?.kind).toBe('gm');
  for(const roleKey of ['o5','o2'])await cmd(gm,{type:'player.setPresent',roleKey,present:true});
  await cmd(gm,{type:'session.open'});
  for(const ingredient of ['ash','moon','dew'])await cmd(gm,{type:'gm.correct',playerKey:'o5',change:{field:'ingredient',ingredient,delta:3},reason:'Проверка бутылька'});
  await a.goto(`/?dev=6105&code=${codes.roles.o5}`);await b.goto(`/?dev=6102&code=${codes.roles.o2}`);
  await expect.poll(async()=>(await state(a))?.kind).toBe('player');
  await expect.poll(async()=>(await state(b))?.kind).toBe('player');
  await cmd(a,{type:'hidden17.produce',recipeId:'focus'});
  await nav(a,'Мастерская');
  await a.getByRole('button',{name:'Наполнить бутылёк своей кровью',exact:true}).click();
  await a.getByRole('dialog').getByRole('button',{name:'Подготовить',exact:true}).click();
  await expect(a.getByRole('status')).toContainText('Отметка: Вельда');
  const vial=(await state(a)).me.items.find((i:any)=>i.ref==='blood-vial');
  expect(vial).toBeTruthy();
  await nav(a,'Сумка');
  const slot=a.locator('.narrative-slot').filter({hasText:'Бутылёк крови'});
  await expect(slot).toContainText('Отметка: Вельда');
  await expect(slot.locator('img')).toHaveAttribute('src',/blood-vial\.webp$/);
  await slot.click();
  await expect(a.getByRole('heading',{name:'Бутылёк крови Отметка: Вельда',exact:true})).toBeVisible();
  await expect(a.locator('.narrative-object')).toContainText('На горлышке оставлена отметка');
  await a.getByRole('combobox',{name:'Кому показать вещь',exact:true}).click();
  await a.getByRole('option',{name:'Брам',exact:true}).click();
  await a.getByRole('button',{name:'Показать',exact:true}).click();
  await nav(b,'Сумка');
  await b.locator('.narrative-document-link').filter({hasText:'Бутылёк крови'}).click();
  await expect(b.getByRole('heading',{name:'Бутылёк крови Отметка: Вельда',exact:true})).toBeVisible();
  const empty={gold:0,ingredients:{ash:0,moon:0,dew:0},items:[]};
  await cmd(a,{type:'narrative.trade.create',to:'o2',give:{...empty,items:[vial.id]},wish:''});
  const trade=(await state(b)).hidden17.narrative.trades.find((t:any)=>t.status==='offered');
  await nav(b,'Сделки');
  await b.locator('.nc-trade-link').first().click();
  await expect(b.getByRole('region',{name:'Предложение автора'})).toContainText('Отметка: Вельда');
  await cmd(b,{type:'narrative.trade.reply',id:trade.id,give:empty});
  await cmd(a,{type:'narrative.trade.confirm',id:trade.id});
  await nav(b,'Сумка');
  await b.locator('.narrative-slot').filter({hasText:'Бутылёк крови'}).click();
  await expect(b.getByRole('heading',{name:'Бутылёк крови Отметка: Вельда',exact:true})).toBeVisible();
  for(const width of [320,390]){
   await b.setViewportSize({width,height:844});
   await b.evaluate(()=>{window.scrollTo(0,0);return document.fonts.ready;});
   expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect(b.locator('.narrative-object-art')).toHaveJSProperty('complete',true);
   expect(await b.locator('.narrative-object-art').evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBeGreaterThan(0);
   await b.screenshot({path:info.outputPath(`blood-vial-${width}.png`),fullPage:true});
  }
 }finally{await gm.close();await a.close();await b.close();}
});
