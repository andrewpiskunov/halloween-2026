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
