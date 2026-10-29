import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { loadContent } from '../content';
import { defaultContentPath } from '../node';

const content = loadContent(JSON.parse(readFileSync(defaultContentPath(), 'utf8')));

describe('loadContent', () => {
  test('30 ролей, позиции 1..30 без повторов', () => {
    expect(content.roles).toHaveLength(30);
    expect(new Set(content.roles.map(r => r.pos)).size).toBe(30);
  });
  test('индексы', () => {
    expect(content.roleByKey['o6'].name).toBe('Грета');
    expect(content.recipeById['focus'].gold).toBe(1);
  });
  test('ошибка на пустом объекте', () => {
    expect(() => loadContent({})).toThrow();
  });
});

describe('поправки содержимого', () => {
  const raw = () => JSON.parse(readFileSync(defaultContentPath(), 'utf8')) as { roles: { key: string; name: string; acting: { vibe: string; voice: string } }[] };
  test('поля роли заменяются, acting сливается, female проходит проверку', () => {
    const c = loadContent(raw(), {
      roles: {
        o3: { name: 'Мирон', title: 'Ученик некроманта', acting: { vibe: 'Начинающий некромант' } },
        o15: { female: true },
        o14: { contacts: [{ role: 'o3', text: 'Мирон очень хочет вашу флейту.' }] },
      },
    });
    expect(c.roleByKey['o3'].name).toBe('Мирон');
    expect(c.roleByKey['o3'].title).toBe('Ученик некроманта');
    expect(c.roleByKey['o3'].acting.vibe).toBe('Начинающий некромант');
    expect(c.roleByKey['o3'].acting.voice).toBe(raw().roles.find(r => r.key === 'o3')!.acting.voice);
    expect(c.roleByKey['o15'].female).toBe(true);
    expect(c.roleByKey['o14'].contacts).toEqual([{ role: 'o3', text: 'Мирон очень хочет вашу флейту.' }]);
    expect(c.roles).toHaveLength(30);
  });
  test('исходный JSON не меняется', () => {
    const json = raw();
    loadContent(json, { roles: { o3: { name: 'Мирон' } } });
    expect(json.roles.find(r => r.key === 'o3')!.name).toBe('Мира');
  });
  test('неизвестная роль, не булево female и не объект это ошибки', () => {
    expect(() => loadContent(raw(), { roles: { zz: { name: 'Кто-то' } } })).toThrow(/неизвестной роли «zz»/);
    expect(() => loadContent(raw(), { roles: { o3: { female: 'да' } } })).toThrow(/female/);
    expect(() => loadContent(raw(), [])).toThrow(/поправки не объект/);
  });
  test('файл поправок этого вечера загружается', () => {
    const patch = JSON.parse(readFileSync(new URL('../../../../content/2026-10-31.json', import.meta.url), 'utf8'));
    const c = loadContent(raw(), patch);
    expect(c.roleByKey['o3'].name).toBe('Мирон');
    expect(c.roleByKey['o15'].female).toBe(true);
    expect(c.roleByKey['o6'].contacts[1].text).toBe('Сив нужен Камень облика и запас зелий.');
  });
});
