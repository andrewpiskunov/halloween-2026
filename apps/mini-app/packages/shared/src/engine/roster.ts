import type { Content } from '../content';

export const MIN_N = 12;
export const MAX_N = 30;
const BASE = 20;      // роли 1–20 идут по порядку
const SHIP_FROM = 24; // торговый дом входит блоком только при N ≥ 24

/** Состав по правилу 6.1: роли 1–min(N,20), при N ≥ 24 торговый дом Т1–Т4, затем резерв по порядку. */
export function defaultRoster(content: Content, n: number): string[] {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) throw new RangeError(`N вне ${MIN_N}..${MAX_N}: ${n}`);
  const roles = [...content.roles].sort((a, b) => a.pos - b.pos);
  const base = roles.filter(r => r.pos <= BASE).slice(0, n).map(r => r.key);
  if (n <= BASE) return base;
  const ship = roles.filter(r => r.pos > BASE && r.side === 'ship').map(r => r.key);
  const reserve = roles.filter(r => r.pos > BASE && r.side !== 'ship').map(r => r.key);
  const withShip = n >= SHIP_FROM ? [...base, ...ship] : base;
  return [...withShip, ...reserve.slice(0, n - withShip.length)];
}
