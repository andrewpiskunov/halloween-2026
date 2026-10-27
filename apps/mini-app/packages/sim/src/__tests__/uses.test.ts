import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ABILITY_BY_ROLE, ABILITY_SPECS, type AbilityKind } from '@fair/shared';
import { Rng } from '../rng';
import { ALLOWED_INVALID, HOSTILE, useFor } from '../uses';
import { Game } from './fixture';

/** Виды, которым нужна вещь или защита: без неё useFor возвращает null. */
const PREREQ = new Set<AbilityKind>(['reforge', 'disassemble', 'sellToBank', 'transferProtection']);
const ALLOWED_CODES = ['insufficient', 'limit', 'not_found', 'reserved', 'not_owner'];
const ALL_KINDS = Object.keys(ABILITY_SPECS) as AbilityKind[];

describe('useFor', () => {
  test('на 30 каждая роль получает применение своего вида или null только при отсутствии предпосылок', () => {
    const g = new Game(30);
    const rng = new Rng(11);
    const seen = new Set<AbilityKind>();
    for (const key of g.s.roster) {
      const kind = ABILITY_BY_ROLE[key];
      const view = g.view(key);
      const use = useFor(kind, view, rng);
      seen.add(kind);
      if (use === null) {
        expect(PREREQ.has(kind), `${key} ${kind}`).toBe(true);
        continue;
      }
      expect(use.kind).toBe(kind);
      // цель, если есть, среди присутствующих и не сам автор
      const target = 'target' in use ? use.target : undefined;
      if (target !== undefined) {
        expect(target).not.toBe(key);
        expect(view.others.map(o => o.roleKey)).toContain(target);
      }
      // движок принимает применение либо отказывает допустимо
      const r = g.run({ type: 'ability.use', use }, key);
      if (!r.ok) {
        const okInvalid = r.error === 'invalid' && ALLOWED_INVALID[kind].some(s => (r.detail ?? '').includes(s));
        expect(ALLOWED_CODES.includes(r.error) || okInvalid, `${key} ${kind}: ${r.error} ${r.detail ?? ''}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual([...ALL_KINDS].sort());
  });

  test('Хельга: reforge null без изделия, после shop.buy и shop.craft применение проходит', () => {
    const g = new Game(30);
    const rng = new Rng(5);
    expect(useFor('reforge', g.view('n20'), rng)).toBeNull();
    g.must({ type: 'shop.buy', ingredient: 'ash' }, 'n20');
    g.must({ type: 'shop.craft', recipeId: 'cleanse' }, 'n20');
    const use = useFor('reforge', g.view('n20'), rng);
    expect(use).not.toBeNull();
    if (use?.kind !== 'reforge') throw new Error('ожидалась перековка');
    expect(use.into).not.toBe('cleanse');
    const r = g.run({ type: 'ability.use', use }, 'n20');
    expect(r.ok).toBe(true);
  });

  test('Астра копирует grow с ингредиентом, который у неё есть', () => {
    const g = new Game(30);
    const view = g.view('o17');
    const use = useFor('copyAbility', view, new Rng(2));
    if (use?.kind !== 'copyAbility' || use.copy.kind !== 'grow') throw new Error('ожидалась копия grow');
    expect(view.me.available.ingredients[use.copy.give]).toBeGreaterThan(0);
  });

  test('transferProtection: с защитой у себя переносит её другому', () => {
    const g = new Game(30);
    expect(useFor('transferProtection', g.view('o16'), new Rng(1))).toBeNull();
    g.must({ type: 'gm.correct', playerKey: 'o16', change: { field: 'protection', value: true }, reason: 'тест' }, 'gm');
    const use = useFor('transferProtection', g.view('o16'), new Rng(1));
    if (use?.kind !== 'transferProtection') throw new Error('ожидался перенос');
    expect(use.from).toBe('o16');
    expect(use.to).not.toBe('o16');
    expect(g.run({ type: 'ability.use', use }, 'o16').ok).toBe(true);
  });

  test('одно зерно даёт одинаковые применения', () => {
    const g = new Game(30);
    const a = new Rng(9), b = new Rng(9);
    for (const key of g.s.roster) {
      const kind = ABILITY_BY_ROLE[key];
      expect(useFor(kind, g.view(key), a)).toEqual(useFor(kind, g.view(key), b));
    }
  });

  test('HOSTILE и белый список invalid: тексты взяты из движка', () => {
    expect([...HOSTILE].sort()).toEqual(['stealGold', 'stealIngredient', 'thorns']);
    expect(Object.keys(ALLOWED_INVALID).sort()).toEqual([...ALL_KINDS].sort());
    const dir = fileURLToPath(new URL('../../../shared/src/engine/', import.meta.url));
    const source = readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(dir + f, 'utf8')).join('\n');
    for (const list of Object.values(ALLOWED_INVALID)) for (const s of list) expect(source, s).toContain(`'${s}'`);
  });
});
