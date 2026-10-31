import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const API = 'http://localhost:8091';
const content = JSON.parse(readFileSync(new URL('../../../docs/design/game-data-v0.2.json', import.meta.url), 'utf8'));
async function cmd(page: Page, command: object) {
  const result = await page.evaluate(async command => {
    // @ts-ignore Модуль приложения в браузере Vite.
    const { run } = await import('/src/store.ts');
    return run(command);
  }, command);
  expect(result.ok).toBe(true);
}
const confirm = (page: Page, label: string) => page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();

test('свободная заявка, личная карточка, подтверждение применения, отмена и портреты', async ({ browser, request }, info) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const player = await browser.newPage({ viewport: { width: 360, height: 780 } });
  const other = await browser.newPage();
  for (const page of [gm, player, other]) page.setDefaultTimeout(10_000);
  const codes = await (await request.get(`${API}/api/dev/codes`)).json();
  await gm.goto(`/?dev=100&code=${codes.gm}`);
  await expect(gm.getByRole('spinbutton')).toBeVisible();
  await cmd(gm, { type: 'session.setN', n: 12 });
  const roster = await gm.evaluate(async () => {
    // @ts-ignore Модуль приложения в браузере Vite.
    const { view } = await import('/src/store.ts');
    return view.value.state.roster as string[];
  });
  for (const roleKey of roster) await cmd(gm, { type: 'player.setPresent', roleKey, present: true });
  await cmd(gm, { type: 'session.open' });
  const invites = await (await request.get(`${API}/api/dev/codes`)).json();
  try {
    await player.goto(`/?dev=701&code=${invites.roles.o1}`);
    await other.goto(`/?dev=702&code=${invites.roles.o2}`);
    await player.locator('nav.tabs').getByRole('button', { name: 'События' }).click();
    await player.getByRole('button', { name: 'Новая заявка' }).click();
    await player.getByLabel('Название заявки', { exact: true }).fill('Хочу оживить тень');
    await player.getByLabel('Чего хотите добиться и как будете действовать').fill('Приведу свидетелей и дам тени голос.');
    await player.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
    await expect(player.getByRole('heading', { name: 'Хочу оживить тень' })).toBeVisible();
    await gm.locator('nav.tabs').getByRole('button', { name: 'Сюжет' }).click();
    const req = gm.locator('.m-card').filter({ has: gm.getByRole('heading', { name: 'Хочу оживить тень', exact: true }) });
    await req.getByLabel('Условия или результат заявки').fill('Принеси Камень облика.');
    await req.getByRole('button', { name: 'Предложить условия' }).click();
    await confirm(gm, 'Отправить');
    await expect(player.locator('.story-reply')).toContainText('Принеси Камень облика.');
    await other.locator('nav.tabs').getByRole('button', { name: 'События' }).click();
    await expect(other.getByText('Хочу оживить тень', { exact: true })).toHaveCount(0);
    await gm.getByRole('button', { name: 'Карточки', exact: true }).click();
    await gm.getByRole('button', { name: '+ Способность', exact: true }).click();
    await gm.getByRole('combobox', { name: 'Владелец карточки' }).click();
    await gm.getByRole('option', { name: 'Серафина', exact: true }).click();
    await gm.getByLabel('Название карточки', { exact: true }).fill('Живая тень');
    await gm.getByLabel('Что действует: эффект, задача или условия договора').fill('Один раз попросить тень добыть ответ.');
    await gm.getByLabel('Цена, ограничения и способ освобождения').fill('Одна монета, передать ведущему.');
    await gm.getByRole('button', { name: 'Сохранить карточку' }).click();
    await confirm(gm, 'Сохранить');
    const ability = player.locator('.story-card').filter({ has: player.getByRole('heading', { name: 'Живая тень', exact: true }) });
    await expect(ability).toContainText('Применений: 1');
    await expect(other.getByRole('heading', { name: 'Живая тень', exact: true })).toHaveCount(0);
    await ability.getByRole('button', { name: 'Попросить применить' }).click();
    await ability.getByLabel('Чего хотите добиться и как будете действовать').fill('Тень спрашивает у дракона моё настоящее имя.');
    await ability.getByRole('button', { name: 'Отправить заявку' }).click();
    await gm.getByRole('button', { name: 'Заявки', exact: true }).click();
    const use = gm.locator('.m-card').filter({ has: gm.getByRole('heading', { name: 'Применить: Живая тень', exact: true }) });
    await use.getByLabel('Условия или результат заявки').fill('Тень возвращается с ответом: Искра.');
    await use.getByRole('button', { name: 'Подтвердить результат' }).click();
    await confirm(gm, 'Отправить');
    await expect(ability).toContainText('Применений: 0');
    await player.reload();
    await player.locator('nav.tabs').getByRole('button', { name: 'События' }).click();
    await expect(ability).toContainText('Применений: 0');
    await gm.getByRole('button', { name: 'История', exact: true }).click();
    const history = gm.locator('.m-card').filter({ hasText: 'Ответ: Применить: Живая тень' });
    await history.getByRole('button', { name: 'Отменить вмешательство' }).click();
    await confirm(gm, 'Отменить изменение');
    await expect(ability).toContainText('Применений: 1');
    await expect(ability).toContainText('Применение ждёт решения');
    await gm.getByRole('button', { name: 'Послания', exact: true }).click();
    await gm.getByLabel('Заголовок послания').fill('Шёпот Сарна');
    await gm.getByLabel('Текст послания').fill('Я помню твоё пламя.');
    await gm.getByRole('checkbox', { name: 'Серафина', exact: true }).check();
    await gm.getByRole('button', { name: 'Отправить послание' }).click();
    await confirm(gm, 'Отправить');
    await expect(player.getByRole('heading', { name: 'Шёпот Сарна' })).toBeVisible();
    await expect(other.getByRole('heading', { name: 'Шёпот Сарна' })).toHaveCount(0);
    for (const page of [player, gm]) {
      await page.setViewportSize({ width: 320, height: 780 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await player.screenshot({ path: info.outputPath('player-story.png'), fullPage: true });
    await gm.screenshot({ path: info.outputPath('gm-story.png'), fullPage: true });
    const gallery = await browser.newPage({ viewport: { width: 1200, height: 1300 } });
    await gallery.goto('/');
    await gallery.setContent(`<body style="background:#e9dfc7;font:16px Georgia;margin:20px"><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px">${content.roles.map((r: { key: string; name: string }) => `<div><img style="width:170px;height:170px;object-fit:cover" src="/assets/portraits/${r.key}.jpg"><div>${r.key} · ${r.name}</div></div>`).join('')}</div></body>`);
    await gallery.locator('img').evaluateAll(async imgs => { await Promise.all(imgs.map(i => (i as HTMLImageElement).decode())); });
    expect(await gallery.locator('img').evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await gallery.screenshot({ path: info.outputPath('portraits.png'), fullPage: true });
    await gallery.close();
  } finally {
    await cmd(gm, { type: 'session.reset' });
    await Promise.all([gm.close(), player.close(), other.close()]);
  }
});
