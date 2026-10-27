import { describe, expect, test } from 'vitest';
import { ABILITY_BY_ROLE, ABILITY_SPECS, COPY_SOURCES, type AbilityKind } from '../abilities';
import { CURSED_AT_START } from '../engine/session';
import { content } from './helpers';

const kinds = Object.keys(ABILITY_SPECS) as AbilityKind[];
const where = (pred: (k: AbilityKind) => boolean) => kinds.filter(pred).sort();

describe('каталог способностей', () => {
  test('ABILITY_BY_ROLE покрывает ровно 30 ролей содержимого', () => {
    expect(Object.keys(ABILITY_BY_ROLE).sort()).toEqual(content.roles.map(r => r.key).sort());
    expect(Object.keys(ABILITY_BY_ROLE)).toHaveLength(30);
  });

  test('25 видов; каждый вид роли есть в ABILITY_SPECS, spec.kind совпадает с ключом', () => {
    expect(kinds).toHaveLength(25);
    for (const kind of Object.values(ABILITY_BY_ROLE)) expect(kinds).toContain(kind);
    for (const k of kinds) expect(ABILITY_SPECS[k].kind).toBe(k);
  });

  test('враждебные: stealGold, stealIngredient, thorns; словесная только askYesNo', () => {
    expect(where(k => ABILITY_SPECS[k].hostile)).toEqual(['stealGold', 'stealIngredient', 'thorns']);
    expect(where(k => ABILITY_SPECS[k].verbal)).toEqual(['askYesNo']);
  });

  test('согласие, место в Мастерской и режимы цели по таблице 2.2', () => {
    expect(where(k => ABILITY_SPECS[k].consent)).toEqual(['cleanseOther', 'copyAbility', 'discountOther', 'transferProtection']);
    expect(where(k => ABILITY_SPECS[k].place === 'workshop')).toEqual([
      'buyBulk', 'buyCheap', 'buyFromBank', 'disassemble', 'focusFree', 'grow', 'payAshWithGold',
      'reforge', 'sellToBank', 'substituteIngredient', 'swapIngredient',
    ]);
    expect(where(k => ABILITY_SPECS[k].target === 'other')).toEqual([
      'askSide', 'askYesNo', 'cleanseOther', 'inspectInventory', 'knowGold', 'protectOther', 'stealGold', 'stealIngredient', 'thorns',
    ]);
    expect(where(k => ABILITY_SPECS[k].target === 'any')).toEqual(['discountOther']);
    expect(where(k => ABILITY_SPECS[k].target === 'protectedAndOther')).toEqual(['transferProtection']);
    expect(where(k => ABILITY_SPECS[k].target === 'self')).toEqual([]);
  });

  test('COPY_SOURCES: владельцы оригиналов для Астры', () => {
    expect(COPY_SOURCES).toEqual({ grow: 'o2', substituteIngredient: 'o6', discountOther: 'o14' });
    for (const [kind, owner] of Object.entries(COPY_SOURCES)) expect(ABILITY_BY_ROLE[owner]).toBe(kind);
  });

  test('CURSED_AT_START совпадает с ролями, у которых в extra есть «проклят»', () => {
    expect(CURSED_AT_START).toEqual(content.roles.filter(r => /проклят/i.test(r.extra)).map(r => r.key));
  });
});
