import type { ComponentChildren } from 'preact';

interface Props { emoji: string; title: ComponentChildren; sub?: ComponentChildren; children?: ComponentChildren }

/** Строка вещи: эмодзи в рамке, название, подпись и кнопки справа. */
export function ItemCard({ emoji, title, sub, children }: Props) {
  return (
    <div class="item">
      <i>{emoji}</i>
      <div class="item-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {children && <div class="item-actions">{children}</div>}
    </div>
  );
}
