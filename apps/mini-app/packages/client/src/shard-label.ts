/** Номер для читателя; внутренние ref и сохранённые игровые события остаются прежними. */
export function shardNumber(ref: string): string {
  return ({ I: '1', II: '2', III: '3', IV: '4', V: '5' } as Record<string, string>)[ref] ?? ref;
}
