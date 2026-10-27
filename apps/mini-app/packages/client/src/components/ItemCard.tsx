import type { ComponentChildren } from 'preact';
import { Thumb } from './Thumb';

interface Props { emoji: string; img?: string; title: ComponentChildren; text?: string; sub?: ComponentChildren; children?: ComponentChildren }

/** Строка вещи: цветная иконка (эмодзи, если картинки нет), название, текст вещи (у улики), подпись и кнопки справа. */
export function ItemCard({ emoji, img, title, text, sub, children }: Props) {
  return (
    <div class="item">
      <Thumb src={img} emoji={emoji} />
      <div class="item-text">
        <b>{title}</b>
        {text && <p class="item-desc">{text}</p>}
        {sub && <span>{sub}</span>}
      </div>
      {children && <div class="item-actions">{children}</div>}
    </div>
  );
}
