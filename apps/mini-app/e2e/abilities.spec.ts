import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../../../docs/design/game-data-v0.2.json', import.meta.url), 'utf8'));
const API = 'http://localhost:8091';
async function command(page: Page, cmd: object) {
  const result = await page.evaluate(async cmd => {
    // @ts-ignore Модуль приложения через Vite.
    const { run } = await import('/src/store.ts');
    return run(cmd);
  }, cmd);
  expect(result.ok).toBe(true);
}
async function fits(page: Page, selector: string) {
  const outside = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => {
    const r = node.getBoundingClientRect();
    return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
  }).map(node => node.textContent));
  expect.soft(outside, 'Элементы должны помещаться по ширине экрана').toEqual([]);
}
test('способности 30 ролей: мобильные формы и результат Сив', async ({ browser, request }, testInfo) => {
  test.setTimeout(180_000);
  const gm = await browser.newPage();
  const codes = await (await request.get(`${API}/api/dev/codes`)).json();
  await gm.goto(`/?dev=100&code=${codes.gm}`);
  await expect(gm.getByRole('spinbutton')).toBeVisible();
  await command(gm, { type: 'session.setN', n: 30 });
  for (const role of data.roles) await command(gm, { type: 'player.setPresent', roleKey: role.key, present: true });
  await command(gm, { type: 'session.open' });
  await command(gm, { type: 'clock.pause' });
  for (const key of ['o13', 'n20', 't1', 'o1', 'o5', 'o6', 'o17']) {
    for (const ingredient of ['ash', 'moon', 'dew']) await command(gm, {
      type: 'gm.correct', playerKey: key, change: { field: 'ingredient', ingredient, delta: 4 }, reason: 'Тест форм изделий',
    });
  }
  const invites = await (await request.get(`${API}/api/dev/codes`)).json();
  try {
    for (const [index, role] of data.roles.entries()) {
      await test.step(`${role.name} (${role.key})`, async () => {
        const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        try {
          await page.goto(`/?dev=${1000 + index}&code=${invites.roles[role.key]}`);
          let card = page.locator('.m-card').filter({ has: page.getByRole('heading', { name: 'Способность', exact: true }) });
          await expect(card).toContainText('Доступна в этом акте');
          if (['o13', 'n20', 't1'].includes(role.key)) {
            await command(page, { type: 'shop.craft', recipeId: 'cleanse' });
            await command(page, { type: 'shop.craft', recipeId: 'ward' });
          }
          if (await card.getByRole('button', { name: 'В мастерскую', exact: true }).count()) {
            await card.getByRole('button', { name: 'В мастерскую', exact: true }).click();
          } else {
            await card.getByRole('button', { name: 'Применить', exact: true }).click();
          }
          for (const select of await card.getByRole('combobox').all()) {
            await select.click();
            await expect(page.getByRole('listbox')).toBeVisible();
            await fits(page, '.sheet, .sheet-item');
            const options = page.getByRole('option');
            if (await options.count()) await options.first().click();
            else await page.keyboard.press('Escape');
          }
          for (const width of [320, 360, 390]) {
            await page.setViewportSize({ width, height: 780 });
            await fits(page, '.ab-form, .ab-form button, .ab-craft button');
          }
          await page.setViewportSize({ width: 360, height: 780 });
          const inline = ['o1', 'o5'].includes(role.key)
            ? page.locator('.ab-craft').getByRole('button', { name: 'Создать со способностью' }).first()
            : ['o3', 'r3'].includes(role.key) ? page.getByRole('button', { name: /^За 1/ }).first()
            : role.key === 'n19' ? page.getByRole('button', { name: 'Из банка за 2' }).first() : null;
          if (inline) {
            await expect(inline).toBeEnabled();
            await inline.click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
          }
          const apply = card.locator('.ab-form').getByRole('button', { name: /^(Применить|Оптом: 2 за 3)$/ });
          if (await apply.count() && await apply.isEnabled()) {
            await apply.click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await fits(page, '.modal, .modal button');
            await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
          }
          if (['o2', 'n18'].includes(role.key)) {
            const selected = await page.evaluate(async () => {
              // @ts-ignore Модуль приложения через Vite.
              const { view } = await import('/src/store.ts');
              const a = view.value.me.available.ingredients;
              const ingredient = ['ash', 'moon', 'dew'].find(i => a[i] > 0)!;
              return { ingredient, count: a[ingredient] };
            });
            await command(gm, { type: 'gm.correct', playerKey: role.key, change: { field: 'ingredient', ingredient: selected.ingredient, delta: -selected.count }, reason: 'Тест исчезнувшего ингредиента' });
            await expect.soft(apply, 'Нельзя отдать исчезнувший из сумки ингредиент').toBeDisabled();
          }
          if (role.key === 'o17') {
            for (const effect of ['Рост', 'Воодушевление']) {
              await card.getByRole('button', { name: new RegExp(effect) }).click();
              const select = card.getByRole('combobox');
              await select.click();
              await page.getByRole('option').first().click();
              await fits(page, '.ab-form, .ab-form button');
              await card.locator('.ab-form').getByRole('button', { name: 'Применить', exact: true }).click();
              await expect(page.getByRole('dialog')).toContainText('Попросить');
              await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
            }
            await card.getByRole('button', { name: /Замена ингредиента/ }).click();
            await card.locator('.ab-form').getByRole('button', { name: 'В мастерскую' }).click();
            await expect(page.getByRole('heading', { name: /Мастерская/ })).toBeVisible();
          }
          if (['o6', 'o17'].includes(role.key)) {
            const recipe = page.locator('.item-block').filter({ hasText: 'Очищающее зелье' });
            await recipe.getByRole('button', { name: 'Создать со способностью' }).click();
            await recipe.getByRole('button', { name: /пепел/i }).first().click();
            await recipe.getByRole('button', { name: /роса/i }).last().click();
            await fits(page, '.choice, .choice button');
          }
          if (role.key === 'n20') {
            const apply = card.locator('.ab-form').getByRole('button', { name: 'Применить', exact: true });
            await card.getByRole('combobox', { name: 'Вещь', exact: true }).click();
            await page.getByRole('option', { name: /Защитный талисман/ }).click();
            await expect.soft(apply, 'Нельзя перековать талисман в тот же талисман').toBeDisabled();
            await card.getByRole('combobox', { name: 'Во что', exact: true }).click();
            await page.getByRole('option', { name: /Очищающее зелье/ }).click();
            await command(gm, { type: 'gm.correct', playerKey: role.key, change: { field: 'gold', delta: -4 }, reason: 'Тест нехватки золота' });
            await expect.soft(apply, 'Для перековки нужна свободная монета').toBeDisabled();
          }
          if (role.key === 'o13') {
            await command(gm, { type: 'gm.correct', playerKey: role.key, change: { field: 'gold', delta: 1000 }, reason: 'Тест запаса мастерской' });
            await page.evaluate(async () => {
              // @ts-ignore Модуль приложения через Vite.
              const { view, run } = await import('/src/store.ts');
              const count = view.value.workshop.ash - 1;
              const result = await run({ type: 'shop.buy', ingredient: 'ash', count });
              if (!result.ok) throw new Error(JSON.stringify(result));
            });
            await expect.soft(card.locator('.ab-form').getByRole('button', { name: 'Применить', exact: true }), 'Два одинаковых ингредиента требуют двух единиц в запасе').toBeDisabled();
          }
          if (role.key === 'o15') {
            await card.locator('.ab-form').getByRole('button', { name: 'Применить', exact: true }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Применить', exact: true }).click();
            const intel = page.locator('.m-card').filter({ hasText: 'Что вы узнали' });
            await expect(intel).toBeVisible();
            for (const width of [320, 360, 390]) {
              await page.setViewportSize({ width, height: 780 });
              await intel.scrollIntoViewIfNeeded();
              await page.screenshot({ path: testInfo.outputPath(`siv-${width}.png`) });
              await fits(page, '.m-row, .m-row > b');
            }
          }
          expect(errors).toEqual([]);
        } finally { await context.close(); }
      });
    }
  } finally {
    await command(gm, { type: 'session.reset' });
    await gm.close();
  }
});
