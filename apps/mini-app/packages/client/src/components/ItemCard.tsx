import type { ComponentChildren } from 'preact';
import { Thumb } from './Thumb';

interface Props { emoji: string; img?: string; title: ComponentChildren; sub?: ComponentChildren; children?: ComponentChildren }

/** Строка вещи: цветная иконка (эмодзи, если картинки нет), название, подпись и кнопки справа. */
export function ItemCard({ emoji, img, title, sub, children }: Props) {
  return (
    <div class="item">
      <Thumb src={img} emoji={emoji} />
      <div class="item-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {children && <div class="item-actions">{children}</div>}
    </div>
  );
}
