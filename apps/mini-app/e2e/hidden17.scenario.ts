import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../../../docs/design/gm-book/hidden-17.json', import.meta.url), 'utf8'));
async function cmd(page: Page, command: object) {
  const result = await page.evaluate(async command => {
    // @ts-ignore Vite module
    return (await import('/src/store.ts')).run(command);
  }, command);
  expect(result, JSON.stringify(command)).toMatchObject({ ok: true });
}
async function state(page: Page): Promise<any> {
  return page.evaluate(async () => {
    // @ts-ignore Vite module
    return (await import('/src/store.ts')).view.value;
  });
}
const nav = (p: Page, name: string) => p.locator('nav.tabs').getByRole('button', { name, exact: true }).click();
const confirm = (p: Page, name: string) => p.getByRole('dialog').getByRole('button', { name, exact: true }).click();
async function pick(p: Page, name: string, choice: string) { await p.getByRole('combobox', { name, exact: true }).click(); await p.getByRole('option', { name: choice, exact: true }).click(); }
async function checkScreen(p: Page, name: string) {
  await p.evaluate(() => document.fonts.ready);
  const overflow = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
  }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 80) })));
  if (overflow.length) await p.screenshot({ path: test.info().outputPath(`overflow-${name.replace(/[^a-z0-9]/gi, '_')}.png`), fullPage: true });
  expect.soft(overflow, name).toEqual([]);
  expect.soft(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  const broken = await p.locator('img').evaluateAll(async imgs => {
    await Promise.all(imgs.map(i => (i as HTMLImageElement).decode().catch(() => undefined)));
    return imgs.filter(i => !(i as HTMLImageElement).naturalWidth).map(i => i.getAttribute('src'));
  });
  expect(broken, `${name}: картинки`).toEqual([]);
}

test('17 закрытых вводных, производство, заказ, кости и финал у могилы', async ({ browser, request }, info) => {
  test.setTimeout(180000);
  const gm = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const codes = await (await request.get('http://localhost:8091/api/dev/codes')).json();
  await gm.goto(`/?dev=100&code=${codes.gm}`);
  await expect(gm.getByText('Основной состав · 17 героев')).toBeVisible();
  expect((await state(gm)).state.roster).toHaveLength(17);
  for (const roleKey of Object.keys(source.roles)) await cmd(gm, { type: 'player.setPresent', roleKey, present: true });
  await cmd(gm, { type: 'session.open' });
  const players: Record<string, Page> = {}; let tid = 2000;
  const errors: string[] = [];
  try {
    for (const key of Object.keys(source.roles)) {
      const p = await browser.newPage({ viewport: { width: 320, height: 780 } }); players[key] = p;
      p.on('pageerror', error => errors.push(`${key}: ${error.message}`));
      await p.goto(`/?dev=${++tid}&code=${codes.roles[key]}`);
      await expect(p.getByText('Только ваша история')).toBeVisible();
      await expect(p.getByText('Общие правила ярмарки', { exact: true })).toBeVisible();
      await expect(p.locator('.secret.rumor')).toHaveCount(0);
      await expect(p.getByText('По функции', { exact: true })).toHaveCount(0);
      await expect(p.getByText(source.roles[key].publicFace, { exact: true })).toHaveCount(1);
      await expect(p.getByRole('heading', { name: 'Что вы можете сделать в финале', exact: true })).toBeVisible();
      for (const text of Object.values(source.roles[key].finale) as string[]) await expect(p.getByText(text, { exact: true })).toBeVisible();
      for (const text of source.roles[key].firstSteps) await expect(p.getByText(text, { exact: true })).toHaveCount(1);
      await checkScreen(p, `${key}: Роль`);
      await p.screenshot({ path: info.outputPath(`role-${key}.png`), fullPage: true });
      if (key === 'o2') await p.locator('.finale-guide').screenshot({ path: info.outputPath('bram-finale.png') });
      const v = await state(p), payload = JSON.stringify(v);
      expect(v.hidden17.briefing.secret).toBe(source.roles[key].secret);
      for (const [other, role] of Object.entries(source.roles) as [string, any][]) if (other !== key) expect(payload).not.toContain(role.secret);
      expect(v.public.factions).toEqual([]); expect(v.altars).toEqual([]);
      await nav(p, 'Мастерская'); await expect(p.getByText('Работа мастера', { exact: true })).toBeVisible();
      await checkScreen(p, `${key}: Мастерская`);
      if (key === 'o3') await p.screenshot({ path: info.outputPath('miron-workshop.png'), fullPage: true });
      await p.getByRole('button', { name: 'Моё ремесло', exact: true }).click();
      await checkScreen(p, `${key}: Моё ремесло`);
      await nav(p, 'Сумка'); await expect(p.getByRole('button', { name: 'На алтарь' })).toHaveCount(0);
      await checkScreen(p, `${key}: Сумка`);
      await nav(p, 'Сделки'); await checkScreen(p, `${key}: Сделки`);
      await nav(p, 'Таверна'); await checkScreen(p, `${key}: Доска`);
      await p.getByRole('button', { name: 'Кости', exact: true }).click(); await checkScreen(p, `${key}: Кости`);
      await p.getByRole('button', { name: 'Заявки и события', exact: true }).click(); await checkScreen(p, `${key}: Заявки`);
      await nav(p, 'Ритуал'); await expect(p.getByText('Надпись у обвалившейся стены')).toBeVisible();
      await checkScreen(p, `${key}: Ритуал`);
    }
    const a = players.o1, maker = players.o6, velda = players.o5, elmar = players.o9;
    for (const key of ['o1', 'o5', 'o6']) {
      await cmd(gm, { type: 'gm.correct', playerKey: key, change: { field: 'gold', delta: 10 }, reason: 'Тест' });
      for (const ingredient of ['ash', 'moon', 'dew']) await cmd(gm, { type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient, delta: 5 }, reason: 'Тест' });
    }
    await nav(maker, 'Мастерская'); await maker.getByRole('button', { name: 'Моё ремесло', exact: true }).click();
    await pick(maker, 'Изготовляемый товар', 'Фокус силы'); await pick(maker, 'Клиент ремесленника', 'Серафина');
    await maker.getByRole('button', { name: 'Предложить клиенту', exact: true }).click(); await confirm(maker, 'Предложить клиенту');
    await nav(a, 'Мастерская'); await a.getByRole('button', { name: 'Принять и оплатить', exact: true }).click(); await confirm(a, 'Принять и оплатить');
    await expect.poll(async () => (await state(a)).me.items.filter((i: any) => i.kind === 'focus').length).toBe(1);
    await cmd(velda, { type: 'hidden17.produce', recipeId: 'focus' });
    await nav(a, 'Таверна'); await a.getByRole('button', { name: 'Разместить объявление' }).click();
    await a.getByLabel('Заголовок', { exact: true }).fill('Встреча у могилы');
    await a.getByLabel('Что нужно сделать', { exact: true }).fill('Привести свидетеля к плите');
    await a.getByLabel('Награда золотом', { exact: true }).getByRole('button', { name: '+', exact: true }).click();
    await a.getByRole('button', { name: 'Разместить с наградой' }).click(); await confirm(a, 'Разместить');
    await expect(a.locator('.board-post')).toContainText('Встреча у могилы');
    const board = (await state(a)).hidden17.board[0]; await cmd(maker, { type: 'hidden17.board.accept', id: board.id });
    await nav(gm, 'Пульт'); await gm.getByRole('button', { name: 'Подтвердить выполнение', exact: true }).click(); await confirm(gm, 'Подтвердить и выдать');
    await expect(a.locator('.board-post')).toContainText('Награда выдана');
    await cmd(a, { type: 'hidden17.dice.invite', to: 'o6', stake: 1 });
    const dice = (await state(a)).hidden17.dice[0]; await cmd(maker, { type: 'hidden17.dice.accept', id: dice.id });
    await cmd(gm, { type: 'hidden17.dice.start', id: dice.id }); await cmd(gm, { type: 'hidden17.dice.resolve', id: dice.id, rolls: [6, 2] });
    await cmd(gm, { type: 'act.next' }); await cmd(gm, { type: 'act.next' });
    await nav(gm, 'Ритуал'); await gm.getByRole('button', { name: '1 · Начать сборку' }).click(); await confirm(gm, 'Собрать у могилы');
    await nav(a, 'Роль');
    await expect(a.getByText('Обычные способности завершены. Действия финала — во вкладке «Ритуал».', { exact: true })).toBeVisible();
    for (const p of [a, velda, elmar]) {
      await nav(p, 'Ритуал');
      for (const item of (await state(p)).me.items.filter((i: any) => i.kind === 'shard' || i.kind === 'focus')) await cmd(p, { type: 'hidden17.ritual.offer', itemId: item.id, include: true });
    }
    await a.evaluate(() => scrollTo(0, 0)); await gm.evaluate(() => scrollTo(0, 0));
    await a.screenshot({ path: info.outputPath('ritual-player.png'), fullPage: true }); await gm.screenshot({ path: info.outputPath('ritual-gm.png'), fullPage: true });
    await gm.getByRole('button', { name: '2 · Рассыпать пыль' }).click(); await confirm(gm, '2 · Первый удар');
    await a.getByRole('button', { name: 'Формула произнесена' }).click();
    await a.getByRole('button', { name: 'Сохранить скрытый выбор' }).click();
    await gm.getByRole('button', { name: '4 · Раскрыть выбор' }).click(); await confirm(gm, '4 · Раскрыть');
    await gm.getByRole('button', { name: 'Применить ответы и эффекты' }).click(); await confirm(gm, 'Применить эффекты');
    await gm.getByRole('button', { name: '5 · Завершить ритуал' }).click(); await confirm(gm, '5 · Последний удар');
    await nav(a, 'Таверна'); await a.getByRole('button', { name: 'Заявки и события', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Новая заявка', exact: true })).toBeEnabled();
    await nav(gm, 'Итоги'); await expect(gm.getByText('Сарн вернулся', { exact: true })).toBeVisible();
    await gm.getByRole('button', { name: 'Зафиксировать итоги' }).click(); await confirm(gm, 'Закрыть ярмарку');
    await gm.getByRole('button', { name: 'Показать игрокам их итоги' }).click(); await nav(a, 'Итоги');
    await expect(a.getByText('Сарн свободен', { exact: true })).toBeVisible();
    expect(Object.keys((await state(a)).hidden17.ritual.outcome.goals)).toEqual(['o1']);
    for (const page of [a, gm]) {
      await page.locator('img').evaluateAll(async imgs => { await Promise.all(imgs.map(i => (i as HTMLImageElement).decode())); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await a.screenshot({ path: info.outputPath('player.png'), fullPage: true }); await gm.screenshot({ path: info.outputPath('gm.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await Promise.all([gm.close(), ...Object.values(players).map(p => p.close())]); }
});
