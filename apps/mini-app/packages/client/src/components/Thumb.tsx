import { useState } from 'preact/hooks';

interface Props { src?: string; emoji: string; size?: 'sm' | 'md' }

/** Цветная иконка предмета; эмодзи — запасной вариант, если картинки нет или она не загрузилась. */
export function Thumb({ src, emoji, size }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const ok = !!src && broken !== src;
  return (
    <i class={`thumb ${size ?? ''}`} aria-hidden="true">
      {ok ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src ?? null)} /> : emoji}
    </i>
  );
}
