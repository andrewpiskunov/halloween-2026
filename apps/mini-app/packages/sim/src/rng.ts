/**
 * Генератор mulberry32 от зерна: один на прогон, чтобы одно зерно давало одну последовательность команд.
 * Math.random в симуляторе не используется.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Число в [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Случайный элемент непустого списка. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: пустой список');
    return items[this.int(0, items.length - 1)];
  }

  /** true с вероятностью p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
