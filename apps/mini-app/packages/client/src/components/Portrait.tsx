import { portraitUrl } from '../assets';

interface Props {
  roleKey: string;
  emoji: string;
  /** sm — 40 px, без размера — 64 px, big — 96 px, card — портрет на карте роли. */
  size?: 'sm' | 'big' | 'card';
  /** Приглушённая обработка с лёгкой штриховкой. Только для одного портрета на экране: фильтр дорог на слабых Android. */
  tint?: boolean;
}

/** Портрет роли: эмодзи под картинкой assets/portraits/<key>.jpg; круг обрезан по лицу. */
export function Portrait({ roleKey, emoji, size, tint }: Props) {
  return (
    <span class={['portrait', size ?? '', tint ? 'tint' : ''].filter(Boolean).join(' ')}>
      <img
        src={portraitUrl(roleKey)}
        alt=""
        decoding="async"
        onError={e => (e.currentTarget as HTMLImageElement).remove()}
      />
      {emoji}
    </span>
  );
}
