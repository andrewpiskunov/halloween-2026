import { expect, test } from 'vitest';
import { itemMentions } from '../item-mentions';

test('названия вещей в падежах сохраняют исходный текст и получают свою картинку', () => {
  const text='Медный жезл Орвика; без Медного жезла, с Медным жезлом. Получить Корону пепла и Семя леса.';
  const parts=itemMentions(text);
  expect(parts.map(p=>p.text).join('')).toBe(text);
  expect(parts.filter(p=>p.src).map(p=>p.src)).toEqual([
    '/assets/items/copper-wand.jpg','/assets/items/copper-wand.jpg','/assets/items/copper-wand.jpg',
    '/assets/items/crown-of-ash.jpg','/assets/items/forest-seed.jpg',
  ]);
});
test('длинное имя не дробится; обычные слова и HTML не интерпретируются', () => {
  const text='<script>Пепел феникса</script> Роскошный сад рос. Корона пепла, Лунной пылью и 2 Росы.';
  const parts=itemMentions(text);
  expect(parts.map(p=>p.text).join('')).toBe(text);
  expect(parts.filter(p=>p.src).map(p=>p.text)).toEqual(['Пепел феникса','Корона пепла','Лунной пылью','Росы']);
});

test('номер входит в выделенное название осколка во всех падежах', () => {
  const text = 'Вы привезли осколок 2. Тайник для осколка 5; с осколком 3. Акт II.';
  const parts = itemMentions(text);
  expect(parts.map(p => p.text).join('')).toBe(text);
  expect(parts.filter(p => p.src).map(p => p.text)).toEqual(['осколок 2', 'осколка 5', 'осколком 3']);
});
