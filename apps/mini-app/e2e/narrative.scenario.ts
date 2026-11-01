import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../../../docs/design/gm-book/hidden-17.json', import.meta.url), 'utf8'));
async function cmd(page: Page, command: object) {
  const result = await page.evaluate(async command => {
    // @ts-ignore Модуль Vite во время браузерного прогона.
    return (await import('/src/store.ts')).run(command);
  }, command);
  expect(result, JSON.stringify(command)).toMatchObject({ ok: true });
}
async function state(page: Page): Promise<any> {
  return page.evaluate(async () => {
    // @ts-ignore Модуль Vite во время браузерного прогона.
    return (await import('/src/store.ts')).view.value;
  });
}
const nav = (p: Page, name: string) => p.locator('nav.tabs').getByRole('button', { name, exact: true }).click();

// По умолчанию headless Chromium прячет полосу и не воспроизводит сдвиг.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar,OverlayScrollbars'] } });
test.describe('Меню с обычной полосой прокрутки браузера', () => {
  test('меню остаётся на месте на короткой и длинной странице', async ({page,request}) => {
    const codes=await (await request.get('http://localhost:8092/api/dev/codes')).json();
    await page.setViewportSize({width:550,height:1000});
    await page.goto(`/?dev=4201&code=${codes.roles.o1}`);
    await expect.poll(async () => (await state(page))?.kind).toBe('player');
    await page.evaluate(() => document.fonts.ready);
    const geometry=()=>page.locator('nav.tabs').evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {x:r.x,width:r.width,buttons:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,width:r.width};})};
    });
    await nav(page,'Застава');
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    const initial=await geometry();
    await nav(page,'Персонаж');
    expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(true);
    expect(await geometry()).toEqual(initial);
    await page.getByRole('button',{name:'Рассмотреть способность:',exact:false}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await geometry()).toEqual(initial);
    await page.keyboard.press('Escape');
    expect(await geometry()).toEqual(initial);
    await nav(page,'Застава');
    expect(await geometry()).toEqual(initial);
  });
});

const confirm = (p: Page, name: string) => p.getByRole('dialog').getByRole('button', { name, exact: true }).click();
async function pick(p: Page, name: string, choice: string) {
  await p.getByRole('combobox', { name, exact: true }).click();
  await p.getByRole('option', { name: choice, exact: true }).click();
}
async function screen(p: Page, name: string) {
  await p.evaluate(() => document.fonts.ready);
  const overflow = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
  }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 80) })));
  expect.soft(overflow, name).toEqual([]);
  expect.soft(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  const broken = await p.locator('img:visible').evaluateAll(async imgs => {
    await Promise.all(imgs.map(i => (i as HTMLImageElement).decode().catch(() => undefined)));
    return imgs.filter(i => !(i as HTMLImageElement).naturalWidth).map(i => i.getAttribute('src'));
  });
  expect.soft(broken, `${name}: изображения`).toEqual([]);
}

test('сюжетная редакция: 17 закрытых историй, согласованные сделки и мастерская', async ({ browser, request }, info) => {
  test.setTimeout(300000);
  const gm = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const codes = await (await request.get('http://localhost:8092/api/dev/codes')).json();
  const players: Record<string, Page> = {}; const errors: string[] = []; let tid = 4200;
  try {
    await gm.goto(`/?dev=4100&code=${codes.gm}`);
    await expect.poll(async () => (await state(gm))?.kind).toBe('gm');
    for (const roleKey of Object.keys(source.roles)) await cmd(gm, { type: 'player.setPresent', roleKey, present: true });
    await cmd(gm, { type: 'session.open' });
    for (const key of Object.keys(source.roles)) {
      const p = await browser.newPage({ viewport: { width: 320, height: 780 } }); players[key] = p;
      p.on('pageerror', error => errors.push(`${key}: ${error.message}`));
      await p.goto(`/?dev=${++tid}&code=${codes.roles[key]}`);
      await expect.poll(async () => (await state(p))?.kind).toBe('player');
      const v = await state(p);
      expect(v.hidden17.narrative.role.story.length).toBeGreaterThan(0);
      expect(v.hidden17.narrative.role.goals).toHaveLength(2);
      await expect(p.locator('nav.tabs').getByRole('button',{name:'Персонаж',exact:true}).locator('.badge')).toHaveCount(0);
      expect(v.hidden17.narrative.role.gmGoals).toBeUndefined();
      expect(v.public.relics).toEqual([]);
      if (!v.hidden17.narrative.knowledge.includes('joining')) expect(JSON.stringify(v)).not.toContain(source.ritual.formula);
      await expect(p.getByRole('heading', { name: 'Таверна', exact: true })).toBeVisible();
      await expect(p.getByRole('heading',{name:'История ярмарки',exact:true})).toBeVisible();
      await expect(p.locator('.narrative-intro .text')).toHaveText(source.publicIntro);
      expect(await p.locator('.narrative-intro .scr-h').evaluate(el=>{
        const heading=getComputedStyle(el).color;
        const body=getComputedStyle(el.parentElement!.querySelector('.text')!).color;
        return {heading,body};
      })).toEqual({heading:'rgb(34, 26, 18)',body:'rgb(34, 26, 18)'});
      await screen(p,`${key}: введение`);
      await expect(p.locator('nav.tabs img').first()).toHaveAttribute('src', new RegExp(`/assets/portraits/${key}\\.jpg`));
      if(key==='o1') {
        await p.locator('.narrative-intro').screenshot({path:info.outputPath('public-introduction.png')});
        for(const width of [320,390,480]) {
          await p.setViewportSize({width,height:780});
          await screen(p,`навигация: ${width}px`);
          const menu=p.getByRole('navigation',{name:'Разделы ярмарки'});
          const bounds=await menu.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{
            const r=button.getBoundingClientRect();
            return {width:r.width,height:r.height,inside:r.left>=0&&r.right<=innerWidth};
          }));
          expect(bounds).toHaveLength(6);
          for(const r of bounds){expect(r.inside).toBe(true);expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
          await menu.screenshot({path:info.outputPath(`navigation-${width}.png`)});
        }
        await p.setViewportSize({width:320,height:780});
      }
      for (const name of ['Персонаж', 'Сумка', 'Сделки', 'Мастерская', 'Застава']) {
        await nav(p, name); await screen(p, `${key}: ${name}`);
        await expect(p.locator('nav.tabs').getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
      }
      await nav(p, 'Персонаж');
      const art = p.getByRole('button', {name:`Рассмотреть способность: ${v.me.ability.name}`,exact:true});
      await art.click();
      const artwork = p.getByRole('dialog', {name:`Способность: ${v.me.ability.name}`,exact:true});
      await expect(artwork).toBeVisible();
      await expect(artwork.locator('img')).toHaveAttribute('src',new RegExp(`/assets/abilities/${key}\\.webp\\?v=[a-f0-9]{12}$`));
      await expect(artwork.locator('img')).toHaveJSProperty('complete',true);
      await artwork.getByRole('button',{name:'Увеличить',exact:true}).click();
      await expect(artwork.getByRole('button',{name:'Целиком',exact:true})).toHaveAttribute('aria-pressed','true');
      const zoomImage=await artwork.locator('img').boundingBox(),zoomCanvas=await artwork.locator('.portrait-viewer-canvas').boundingBox();
      expect(zoomImage!.y).toBeLessThanOrEqual(zoomCanvas!.y+1);
      if(key==='o17')await artwork.screenshot({path:info.outputPath('ability-zoom.png')});
      await artwork.getByRole('button',{name:'Закрыть изображение способности',exact:true}).click();
      await expect(artwork).toHaveCount(0);
      await expect(art).toBeFocused();
      if(key==='o1'){await art.press('Enter');await expect(artwork).toBeVisible();await p.keyboard.press('Escape');await expect(artwork).toHaveCount(0);await expect(art).toBeFocused();}
      await nav(p, 'Сделки');
      await expect(p.getByRole('combobox', { name: 'Вещь по названию' })).toHaveCount(0);
      await expect(p.getByLabel('Слух', { exact: true })).toHaveCount(0);
    }
    await nav(players.o15,'Персонаж');
    const sivFaces=players.o15.locator('.narrative-acquaintances');
    await expect(sivFaces.getByRole('heading',{name:'Брам',exact:true})).toBeVisible();
    await expect(sivFaces).toContainText('Ваш сосед по холмам');
    await expect(sivFaces).not.toContainText('рощу сожгли');
    await sivFaces.getByRole('button',{name:'Открыть портрет: Брам',exact:true}).click();
    await expect(players.o15.getByRole('dialog',{name:'Портрет: Брам',exact:true})).toBeVisible();
    await players.o15.getByRole('button',{name:'Закрыть портрет',exact:true}).click();
    await screen(players.o15,'Сив: знакомые лица');
    await sivFaces.screenshot({path:info.outputPath('siv-acquaintances.png')});
    await nav(players.o5,'Персонаж');
    await expect(players.o5.locator('main')).toContainText('Вы привезли осколок II и выписки Орвика. В старой заметке футляр флейты назван тайником для осколка V');
    const veldaFaces=players.o5.locator('.narrative-acquaintances');
    await expect(veldaFaces.getByRole('heading',{name:'Никс',exact:true})).toBeVisible();
    await expect(veldaFaces.getByRole('heading',{name:'Астра',exact:true})).toHaveCount(0);
    await veldaFaces.screenshot({path:info.outputPath('velda-acquaintances.png')});
    const signMage=players.o5;
    await nav(signMage,'Мастерская');
    await expect(signMage.getByRole('heading',{name:'Наполнить бутылёк своей кровью',exact:true})).toBeVisible();
    await expect(signMage.getByRole('radio')).toHaveCount(0);
    for(const ingredient of ['ash','moon'])await cmd(gm,{type:'gm.correct',playerKey:'o5',change:{field:'ingredient',ingredient,delta:2},reason:'Тест крови'});
    await cmd(signMage,{type:'shop.craft',recipeId:'focus'});
    await signMage.getByRole('button',{name:'Наполнить бутылёк своей кровью',exact:true}).click();
    await confirm(signMage,'Подготовить');
    await expect(signMage.getByRole('status')).toContainText('Бутылёк крови готов');
    await expect.poll(async()=>Object.values((await state(signMage)).hidden17.prepared).some((p:any)=>p.method==='sign'&&p.controller==='o5'&&p.order===undefined)).toBe(true);
    await screen(signMage,'личная подготовка крови');
    await signMage.screenshot({path:info.outputPath('blood-preparation.png'),fullPage:true});
    const a = players.o1, b = players.o2, maker = players.o6;
    // Показ вещи подтверждается владельцу, выбор сбрасывается; отзыв тоже виден.
    await nav(b,'Мастерская');
    await b.getByRole('combobox',{name:'Что отдать',exact:true}).click();
    await expect(b.getByRole('option').filter({hasText:'Роса'})).toHaveCount(0);
    await b.getByRole('option').first().click();
    await nav(b,'Сделки');
    await nav(a,'Персонаж');
    await a.locator('.narrative-document-link').filter({hasText:'Лист семейной книги'}).click();
    await expect(a.locator('.narrative-letter-art')).toHaveAttribute('src', /family-book\.webp$/);
    await expect(a.locator('.narrative-letter-text .item-mention').filter({hasText:'Корона пепла'})).toBeVisible();
    await expect(a.locator('.item-mention img')).toHaveCount(0);
    await screen(a,'семейная книга с иллюстрацией');
    await a.screenshot({path:info.outputPath('family-book.png'),fullPage:true});
    await a.getByRole('button',{name:'← Назад',exact:true}).click();
    const shownItem=(await state(a)).me.items[0], recipient=(await state(b)).me.role.name;
    await nav(a,'Сумка');
    await a.evaluate(async id=>{
      // @ts-ignore Модуль Vite во время браузерного прогона.
      (await import('/src/narrative-navigation.ts')).openPage({kind:'item',id});
    },shownItem.id);
    await pick(a,'Кому показать вещь',recipient);
    await a.getByRole('button',{name:'Показать',exact:true}).click();
    await expect.poll(async () => (await state(b)).hidden17.knownItems[shownItem.id]?.owner).toBe('o1');
    await expect(a.getByRole('status')).toContainText(`Вещь показана: ${recipient}`);
    await expect(a.getByRole('alert')).toContainText(`Вещь показана: ${recipient}`);
    await expect(a.getByRole('combobox',{name:'Кому показать вещь'})).toContainText('Выберите');
    await expect(a.getByRole('button',{name:'Показать',exact:true})).toBeDisabled();
    await a.screenshot({path:info.outputPath('item-shown.png'),fullPage:true});
    await pick(a,'Кому показать вещь',recipient);
    await a.getByRole('button',{name:'Убрать вещь',exact:true}).click();
    await expect(a.getByRole('status')).toContainText(`Показ завершён: ${recipient}`);
    await expect(a.getByRole('combobox',{name:'Кому показать вещь'})).toContainText('Выберите');
    await expect.poll(async () => Boolean((await state(b)).hidden17.knownItems[shownItem.id])).toBe(false);
    await nav(a,'Сделки');
    const aBefore = (await state(a)).me.available.gold, bBefore = (await state(b)).me.available.gold;
    await pick(a, 'Адресат сделки', (await state(b)).me.role.name);
    await a.getByLabel('Предложить: Золото', {exact:true}).getByRole('button',{name:'+',exact:true}).click();
    await a.getByRole('button', {name:'Предложить обмен или подарок',exact:true}).click(); await confirm(a,'Отправить');
    await expect.poll(async () => (await state(a)).hidden17.narrative.trades.length).toBe(1);
    const t = (await state(a)).hidden17.narrative.trades[0];
    await b.locator('.nc-trade-link').first().click();
    await b.getByRole('button',{name:'Получить в подарок',exact:true}).click(); await confirm(b,'Получить в подарок');
    await expect.poll(async () => (await state(a)).hidden17.narrative.trades[0].status).toBe('replied');
    expect((await state(b)).me.available.gold).toBe(bBefore);
    await a.locator('.nc-trade-link').first().click();
    await a.getByRole('button',{name:'Подтвердить обмен',exact:true}).click();await confirm(a,'Подтвердить обмен');
    await expect.poll(async () => (await state(a)).hidden17.narrative.trades[0].status).toBe('completed');
    expect((await state(a)).me.available.gold).toBe(aBefore-1);
    await expect.poll(async () => (await state(b)).me.available.gold).toBe(bBefore+1);
    await a.reload(); await expect(a.locator('.nc-trade-page')).toContainText('Обмен завершён');
    await a.getByRole('button',{name:'Назад к сделкам',exact:false}).click();
    // Незавершённая новая форма переживает открытие истории и возврат.
    await a.getByLabel('Что хотите получить',{exact:true}).fill('Поговорить у стойки');
    await a.locator('.nc-trade-link').first().click(); await a.getByRole('button',{name:'Назад к сделкам',exact:false}).click();
    await expect(a.getByLabel('Что хотите получить',{exact:true})).toHaveValue('Поговорить у стойки');
    // Пауза блокирует новые шаги, но оставляет чтение истории.
    await cmd(gm,{type:'clock.pause'}); await expect(a.getByText('Пауза: сделки подождут',{exact:true})).toBeVisible(); await cmd(gm,{type:'clock.resume'});
    await nav(a,'Мастерская');
    const material = (await state(a)).me.available.ingredients;
    const ing = ['ash','moon','dew'].find(k=>material[k]>0)!;
    const materialNames: Record<string,string>={ash:'Пепел феникса',moon:'Лунная пыль',dew:'Роса'};
    await a.locator('.nc-stock-card').filter({hasText:materialNames[ing]}).click();
    const stockBefore=(await state(a)).workshop[ing], sellGold=(await state(a)).me.available.gold;
    await a.getByRole('button',{name:'Продать мастеру',exact:true}).click();await confirm(a,'Продать');
    await expect.poll(async () => (await state(a)).workshop[ing]).toBe(stockBefore+1);
    expect((await state(a)).me.available.gold).toBe(sellGold+1);
    await a.getByRole('button',{name:'Купить',exact:true}).click();await confirm(a,'Купить');
    await expect.poll(async () => (await state(a)).workshop[ing]).toBe(stockBefore);
    expect((await state(a)).me.available.gold).toBe(sellGold-1);
    await a.getByRole('button',{name:'Назад в мастерскую',exact:false}).click();
    for (const key of ['o1','o6']) {
      await cmd(gm,{type:'gm.correct',playerKey:key,change:{field:'gold',delta:10},reason:'Вымышленный прогон'});
      for(const ingredient of ['ash','moon','dew']) await cmd(gm,{type:'gm.correct',playerKey:key,change:{field:'ingredient',ingredient,delta:5},reason:'Вымышленный прогон'});
    }
    await nav(maker,'Мастерская');await maker.locator('.nc-recipe-card').filter({hasText:'Фокус силы'}).getByRole('button',{name:'Заказать',exact:true}).click();
    await pick(maker,'Клиент ремесленника',(await state(a)).me.role.name);
    await maker.getByRole('button',{name:'Предложить клиенту',exact:true}).click();await confirm(maker,'Предложить клиенту');
    await a.getByRole('button',{name:'Принять и оплатить',exact:true}).click();await confirm(a,'Принять и оплатить');
    await expect.poll(async () => (await state(a)).me.items.filter((i:any)=>i.kind==='focus').length).toBeGreaterThan(0);
    await a.locator('.nc-recipe-card').filter({hasText:'Фокус силы'}).getByRole('button',{name:'Заказать',exact:true}).click();
    await expect(a.getByRole('button',{name:'Моё ремесло',exact:true})).toHaveCount(0);
    await a.reload();await expect(a.getByRole('heading',{name:'Фокус силы',exact:true})).toBeVisible();
    for(const width of [320,390,768]) {
      await a.setViewportSize({width,height:844});await screen(a,`Заказ ${width}`);await a.screenshot({path:info.outputPath(`recipe-${width}.png`),fullPage:true});
      await maker.setViewportSize({width,height:844});await screen(maker,`Заказ клиенту ${width}`);
    }
    // Источник передаёт только выбранный текст и знания; отзыв не стирает прочитанное.
    const sourceOwner = players.o5;
    const joiningDoc = (await state(sourceOwner)).hidden17.narrative.documents.find((d:any)=>d.knowledge?.includes('joining'));
    expect(joiningDoc).toBeTruthy();
    expect((await state(b)).hidden17.narrative.knowledge).not.toContain('joining');
    expect((await state(b)).hidden17.narrative.documents.some((d:any)=>d.id===joiningDoc.id)).toBe(false);
    await nav(sourceOwner,'Персонаж');
    await sourceOwner.locator('.narrative-document-link').filter({hasText:joiningDoc.title}).click();
    await expect(sourceOwner.getByRole('heading',{name:joiningDoc.title,exact:true})).toBeVisible();
    await pick(sourceOwner,'Кому показать документ',(await state(b)).me.role.name);
    await sourceOwner.getByRole('button',{name:'Показать',exact:true}).click();await confirm(sourceOwner,'Показать');
    await expect(sourceOwner.getByRole('status')).toContainText('Документ показан');
    await expect(sourceOwner.getByRole('combobox',{name:'Кому показать документ',exact:true})).toContainText('Выберите');
    await expect.poll(async () => (await state(b)).hidden17.narrative.knowledge).toContain('joining');
    await nav(b,'Сумка');await b.locator('.narrative-document-link').filter({hasText:joiningDoc.title}).click();
    await expect(b.locator('.narrative-letter-text')).toHaveText(joiningDoc.text);
    await expect(b.getByRole('combobox',{name:'Кому показать документ',exact:true})).toHaveCount(0);
    await pick(sourceOwner,'Кому показать документ',(await state(b)).me.role.name);
    await sourceOwner.getByRole('button',{name:'Забрать документ',exact:true}).click();
    await expect(sourceOwner.getByRole('status')).toContainText('Документ забран');
    await expect.poll(async () => (await state(b)).hidden17.narrative.documents.some((d:any)=>d.id===joiningDoc.id)).toBe(false);
    await expect(b.getByText('Эта страница недоступна',{exact:true})).toBeVisible();
    expect((await state(b)).hidden17.narrative.knowledge).toContain('joining');
    expect((await state(b)).hidden17.ritual.formula).toBe(source.ritual.formula);

    // Ведущий оценивает через интерфейс; до публикации эпилога игрок не получает оценку даже в API.
    const evaluationNote='Свидетели признали самостоятельный поступок героини — проверка эпилога.';
    const otherEvaluation='Личная оценка Брама, невидимая Серафине.';
    await nav(gm,'Итоги');
    await pick(gm,'Герой для оценки стремлений',(await state(a)).me.role.name);
    await pick(gm,'Результат стремления 1','Частичный результат');
    await gm.getByRole('textbox',{name:'Пояснение стремления 1',exact:true}).fill(evaluationNote);
    await gm.getByRole('button',{name:'Сохранить оценку',exact:true}).first().click();await confirm(gm,'Сохранить оценку');
    await expect.poll(async () => (await state(gm)).state.hidden17.narrative.evaluations.o1?.[0]).toEqual({status:'partial',note:evaluationNote});
    await cmd(gm,{type:'narrative.goal',player:'o2',goal:0,evaluation:{status:'achieved',note:otherEvaluation}});
    await nav(a,'Персонаж');expect((await state(a)).hidden17.narrative.evaluations).toEqual({});
    await expect(a.getByText(evaluationNote,{exact:false})).toHaveCount(0);

    // Разрушение запускается до обряда, другой герой спасает осколок через интерфейс.
    await cmd(gm,{type:'hidden17.learn',player:'o1',method:'salt'});
    for(const key of ['o1','o2'])for(const ingredient of ['ash','moon','dew'])await cmd(gm,{type:'gm.correct',playerKey:key,change:{field:'ingredient',ingredient,delta:3},reason:'Проверка сцены спасения'});
    await cmd(a,{type:'shop.craft',recipeId:'cleanse'});
    const potion=(await state(a)).me.items.find((i:any)=>i.kind==='potion');
    await cmd(a,{type:'hidden17.prepare',method:'salt',itemId:potion.id});
    await cmd(b,{type:'shop.craft',recipeId:'ward'});
    const endangered=(await state(a)).me.items.find((i:any)=>i.kind==='shard');
    await nav(a,'Сумка');await a.getByRole('button',{name:`Осколок ${endangered.ref}`,exact:true}).click();
    await a.getByRole('button',{name:'Попросить сцену разрушения',exact:true}).click();await confirm(a,'Попросить сцену');
    await expect.poll(async()=>Object.keys((await state(gm)).state.hidden17.fair.destruction).length).toBe(1);
    const scene=(Object.values((await state(gm)).state.hidden17.fair.destruction) as any[]).at(-1);
    expect((await state(b)).hidden17.fair.scenes).toEqual([]);
    await cmd(gm,{type:'fair.destroy.start',id:scene.id});
    await nav(b,'Таверна');await b.getByRole('button',{name:'Спасти талисманом',exact:true}).click();await confirm(b,'Спасти осколок');
    await expect.poll(async()=>(await state(a)).hidden17.fair.scenes.find((d:any)=>d.id===scene.id)?.status).toBe('saved');
    await screen(b,'осколок спасён до обряда');
    await b.screenshot({path:info.outputPath('saved-shard.png'),fullPage:true});

    // Настоящий лот второго акта остаётся доступен в новой таверне: ставка и получение вещей.
    await cmd(gm,{type:'fair.auction'});
    await expect.poll(async () => (await state(a)).phase).toBe('act1');
    await nav(a,'Таверна');
    const lots=Object.values((await state(gm)).state.lots).filter((l:any)=>l.status==='announced') as any[];
    const auction=lots.find(l=>l.status==='announced');expect(auction).toBeTruthy();
    await expect(a.getByText('Торг на ярмарке',{exact:true})).toBeVisible();
    await expect.poll(async () => (await state(a)).lots.some((l:any)=>l.id===auction.id)).toBe(true);
    const lotRef=(id:string)=> (state(a).then(v=>v.lots.find((l:any)=>l.id===id).items[0]));
    const auctionItem=await lotRef(auction.id);
    const auctionName=auctionItem.kind==='shard'?`Осколок ${auctionItem.ref}`:auctionItem.ref;
    const auctionCard=a.locator('.lot').filter({hasText:auctionName});
    await expect(auctionCard).toBeVisible();
    await cmd(gm,{type:'lot.sealedBids',id:auction.id});
    const auctionGold=(await state(a)).me.available.gold;
    await auctionCard.getByRole('button',{name:'Поставить',exact:true}).click();await confirm(a,'Поставить');
    await expect.poll(async () => (await state(a)).me.available.gold).toBe(auctionGold-1);
    await cmd(gm,{type:'lot.close',id:auction.id});
    await expect.poll(async () => (await state(a)).me.items.some((i:any)=>auction.items.includes(i.id))).toBe(true);
    await expect(auctionCard).toContainText('вам');
    await screen(a,'Таверна: лоты второго акта');

    // Разрешение на свою часть остаётся действующим управлением в сумке на шаге выбора финала.
    await cmd(a,{type:'shop.craft',recipeId:'focus'});
    await cmd(gm,{type:'fair.refresh'});
    const finaleState=(await state(gm)).state;
    const ownShard=(await state(a)).me.items.find((i:any)=>i.kind==='shard');expect(ownShard).toBeTruthy();
    const circleParts=(Object.values(finaleState.items) as any[]).filter(i=>i.kind==='shard'&&i.id!==ownShard.id&&i.owner.type==='player').slice(0,3);
    expect(circleParts).toHaveLength(3);
    const focuses=(await state(a)).me.items.filter((i:any)=>i.kind==='focus').slice(0,2);expect(focuses).toHaveLength(2);
    const entrants=new Set(['o1','o2','o5','o6',...circleParts.map((i:any)=>i.owner.key)]);
    for(const key of entrants){
      await cmd(players[key],{type:'story.request',title:'Поход во двор',text:'В условленное время иду во внутренний двор к плите.',stake:''});
      const requests=Object.values((await state(gm)).state.story.requests) as any[];
      const q=requests.filter(q=>q.author===key).at(-1);
      await cmd(gm,{type:'fair.admit',player:key,requestId:q.id,at:Date.now()-1000});
    }
    await nav(gm,'Ритуал');await screen(gm,'допуски по личным заявкам');
    await cmd(gm,{type:'hidden17.ritual.start'});
    const outsider=Object.keys(players).find(k=>!entrants.has(k))!;
    await nav(players[outsider],'Застава');
    await expect(players[outsider].getByText('Вы наблюдаете за закрытой сценой.',{exact:false})).toBeVisible();
    await expect(players[outsider].getByRole('button',{name:'Положить',exact:true})).toHaveCount(0);
    for(const item of circleParts)await cmd(players[item.owner.key],{type:'hidden17.ritual.offer',itemId:item.id,include:true});
    for(const item of focuses)await cmd(a,{type:'hidden17.ritual.offer',itemId:item.id,include:true});
    await cmd(gm,{type:'hidden17.ritual.powder'});
    await nav(b,'Застава');await b.getByRole('button',{name:'Формула произнесена',exact:true}).click();
    await expect.poll(async () => (await state(a)).hidden17.ritual.step).toBe('choices');
    await nav(a,'Сумка');await a.getByRole('button',{name:`Осколок ${ownShard.ref}`,exact:true}).click();
    await a.getByText('Позволить коснуться части сердца',{exact:true}).click();
    await pick(a,'Кому разрешить обряд над частью',(await state(maker)).me.role.name);
    await expect(a.getByRole('button',{name:'Разрешить',exact:true})).toBeEnabled();
    expect((await state(maker)).hidden17.ritual.accessibleShards).not.toContain(ownShard.id);
    await a.getByRole('button',{name:'Разрешить',exact:true}).click();await confirm(a,'Разрешить');
    await expect.poll(async () => (await state(maker)).hidden17.ritual.accessibleShards).toContain(ownShard.id);
    await expect.poll(async () => (await state(a)).hidden17.ritual.permissions[ownShard.id]).toContain('o6');
    await a.getByRole('button',{name:'Отозвать',exact:true}).click();
    await expect.poll(async () => (await state(maker)).hidden17.ritual.accessibleShards.includes(ownShard.id)).toBe(false);
    await expect.poll(async () => (await state(a)).hidden17.ritual.permissions[ownShard.id]).toEqual([]);
    await screen(a,'Сумка: согласие на часть во время финала');

    await cmd(gm,{type:'hidden17.ritual.reveal'});await cmd(gm,{type:'hidden17.ritual.resolve'});await cmd(gm,{type:'hidden17.ritual.finish'});
    expect((await state(a)).hidden17.narrative.evaluations).toEqual({});
    await cmd(gm,{type:'session.close'});
    await expect.poll(async () => (await state(a)).phase).toBe('closed');
    expect((await state(a)).hidden17.narrative.evaluations).toEqual({});
    await cmd(gm,{type:'session.reveal'});
    await expect.poll(async () => (await state(a)).hidden17.narrative.evaluations[0]).toEqual({status:'partial',note:evaluationNote});
    expect(JSON.stringify(await state(a))).not.toContain(otherEvaluation);
    await nav(a,'Персонаж');await expect(a.getByText(evaluationNote,{exact:false})).toBeVisible();
    await expect(a.getByText('Частично достигнуто.',{exact:true})).toBeVisible();
    // Снятие оценки возвращает отдельное «ещё не оценена», не ложный провал.
    await nav(gm,'Итоги');await pick(gm,'Герой для оценки стремлений',(await state(a)).me.role.name);
    await pick(gm,'Результат стремления 1','Ещё не оценена');
    await gm.getByRole('button',{name:'Снять оценку',exact:true}).first().click();await confirm(gm,'Сохранить оценку');
    await expect.poll(async () => (await state(a)).hidden17.narrative.evaluations[0]).toBeUndefined();
    await expect(a.getByText(evaluationNote,{exact:false})).toHaveCount(0);
    await expect(a.getByText('Ведущий ещё не оценил эту историю.',{exact:true}).first()).toBeVisible();
    // Для выкупа нужна отдельная партия: штатный IV уже продан на торге выше.
    // Явный сброс в конце сценария освобождает её от истории ставок и не затрагивает проверки финала.
    await cmd(gm,{type:'session.reset'});
    await expect.poll(async () => (await state(gm)).state.phase).toBe('setup');
    for(const roleKey of Object.keys(source.roles))await cmd(gm,{type:'player.setPresent',roleKey,present:true});
    await cmd(gm,{type:'session.open'});await cmd(gm,{type:'fair.auction'});
    const newCodes=await (await request.get('http://localhost:8092/api/dev/codes')).json();
    await a.goto(`/?dev=8400&code=${newCodes.roles.o1}`);
    await expect.poll(async () => (await state(a))?.phase).toBe('act1');
    await nav(a,'Таверна');
    const fixed=(Object.values((await state(gm)).state.lots) as any[]).find(l=>l.status==='announced'&&l.status==='announced');
    expect(fixed).toBeTruthy();
    await cmd(gm,{type:'lot.sealedBids',id:fixed.id});await cmd(gm,{type:'lot.close',id:fixed.id});
    const fixedCard=a.locator('.lot').filter({hasText:'Осколок IV'});
    await expect(fixedCard.getByRole('button',{name:'Выкупить',exact:true})).toBeEnabled();
    const fixedGold=(await state(a)).me.available.gold;
    await fixedCard.getByRole('button',{name:'Выкупить',exact:true}).click();await confirm(a,'Выкупить');
    await expect.poll(async () => (await state(a)).me.items.filter((i:any)=>fixed.items.includes(i.id)).length).toBe(fixed.items.length);
    expect((await state(a)).me.available.gold).toBe(fixedGold-4);
    await expect(fixedCard).toContainText('вам');await screen(a,'Таверна: выкуп штатного IV');
    expect(t.items).toEqual({}); expect(errors).toEqual([]);
  } finally { await Promise.all([gm.close(),...Object.values(players).map(p=>p.close())]); }
});
