import { expect, test } from 'vitest';
import { Rng } from '../rng';

test('одно зерно даёт одну последовательность, другое зерно другую', () => {
  const a = new Rng(7), b = new Rng(7), c = new Rng(8);
  const xs = Array.from({ length: 20 }, () => a.next());
  expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
  expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(xs);
  for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
});

test('int(1, 3) даёт только 1..3 и все три значения', () => {
  const rng = new Rng(1);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const n = rng.int(1, 3);
    expect([1, 2, 3]).toContain(n);
    seen.add(n);
  }
  expect(seen.size).toBe(3);
});

test('pick на одном элементе, chance на краях', () => {
  const rng = new Rng(3);
  expect(rng.pick(['один'])).toBe('один');
  expect(() => rng.pick([])).toThrow();
  for (let i = 0; i < 50; i++) { expect(rng.chance(0)).toBe(false); expect(rng.chance(1)).toBe(true); }
});
