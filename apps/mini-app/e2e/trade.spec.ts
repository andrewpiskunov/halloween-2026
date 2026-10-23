import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:8091';

const goldLine = (page: Page) => page.locator('.res > div', { hasText: 'доступно' });

test('ведущий открывает ярмарку на 12, Грета продаёт Фокус Серафине', async ({ browser, request }) => {
  const codes = (await (await request.get(`${API}/api/dev/codes`)).json()) as { gm: string; roles: Record<string, string> };

  const gmCtx = await browser.newContext();
  const gretaCtx = await browser.newContext();
  const serafinaCtx = await browser.newContext();
  try {
    // 1. Ведущий: состав на 12, все пришли, открыть ярмарку.
    const gm = await gmCtx.newPage();
    await gm.goto(`/?dev=100&code=${codes.gm}`);
    await gm.getByRole('spinbutton').fill('12');
    await gm.getByRole('button', { name: /Состав по умолчанию/ }).click();
    await expect(gm.getByText('В составе 12')).toBeVisible();
    const present = gm.getByRole('checkbox', { name: 'пришёл' });
    await expect(present).toHaveCount(12);
    for (const box of await present.all()) await box.check();
    await expect(gm.getByText('пришли 12')).toBeVisible();
    await gm.getByRole('button', { name: /Открыть ярмарку/ }).click();
    await gm.getByRole('dialog').getByRole('button', { name: 'Открыть' }).click();
    await expect(gm.getByText('Ярмарка открыта, состав зафиксирован.')).toBeVisible();

    // 2. Грета (o6): покупает Лунную пыль и создаёт Фокус силы.
    const greta = await gretaCtx.newPage();
    await greta.goto(`/?dev=6&code=${codes.roles.o6}`);
    await greta.locator('nav.tabs').getByRole('button', { name: 'Мастерская' }).click();
    await greta.locator('.item', { hasText: 'Лунная пыль' }).getByRole('button').click();
    await greta.getByRole('dialog').getByRole('button', { name: 'Купить' }).click();
    await expect(greta.getByText('У вас 🪙 4 доступно.')).toBeVisible();
    await greta.locator('.item', { hasText: 'Фокус силы' }).getByRole('button', { name: 'Создать' }).click();
    await greta.getByRole('dialog').getByRole('button', { name: 'Создать' }).click();
    await expect(greta.getByText('У вас 🪙 3 доступно.')).toBeVisible();

    // Сумка: Фокус -> Предложить -> Серафине за 2 золота.
    await greta.locator('nav.tabs').getByRole('button', { name: 'Сумка' }).click();
    const focusRow = greta.locator('.item-block', { hasText: 'Фокус силы' });
    await expect(focusRow).toBeVisible();
    await focusRow.getByRole('button', { name: 'Предложить' }).click();
    await expect(greta.getByRole('heading', { name: /Новое предложение/ })).toBeVisible();
    await greta.getByRole('combobox').selectOption('o1');
    await greta.locator('.bundle').nth(1).locator('.m-row', { hasText: 'Золото' }).getByRole('button', { name: '+' }).click({ clickCount: 2 });
    await expect(greta.locator('.bundle').nth(1).locator('.m-row', { hasText: 'Золото' }).locator('b')).toHaveText('2');
    await greta.getByRole('button', { name: /Отправить/ }).click();
    await expect(greta.getByText(/Исходящее/)).toBeVisible();

    // 3. Серафина (o1): принимает.
    const serafina = await serafinaCtx.newPage();
    await serafina.goto(`/?dev=1&code=${codes.roles.o1}`);
    await serafina.locator('nav.tabs').getByRole('button', { name: 'Сделки' }).click();
    await expect(serafina.getByText(/Входящее/)).toBeVisible();
    await serafina.locator('.m-card.hot').getByRole('button', { name: 'Принять' }).click();
    await serafina.getByRole('dialog').getByRole('button', { name: 'Принять' }).click();
    await expect(serafina.getByText('принято')).toBeVisible();

    // 4. Итог: у Серафины Фокус и 4 золота, у Греты 5 (6 - 2 покупка - 1 рецепт + 2 продажа).
    await serafina.locator('nav.tabs').getByRole('button', { name: 'Сумка' }).click();
    await expect(serafina.locator('.item-block', { hasText: 'Фокус силы' })).toBeVisible();
    await expect(goldLine(serafina)).toHaveText(/^🪙\s*4\s*доступно$/);
    await greta.locator('nav.tabs').getByRole('button', { name: 'Сумка' }).click();
    await expect(greta.locator('.item-block', { hasText: 'Фокус силы' })).toHaveCount(0);
    await expect(goldLine(greta)).toHaveText(/^🪙\s*5\s*доступно$/);
  } finally {
    await Promise.all([gmCtx.close(), gretaCtx.close(), serafinaCtx.close()]);
  }
});
