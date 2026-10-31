import { portraitUrl } from '../assets';
import { content } from '../store';
import { portraitPreview } from './PortraitViewer';

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
  const name = content.value?.roles.find(r => r.key === roleKey)?.name ?? 'Персонаж';
  return (
    <button type="button" aria-label={`Открыть портрет: ${name}`} title="Посмотреть портрет" onClick={e => {
      e.preventDefault(); e.stopPropagation(); portraitPreview.value = { roleKey, name };
    }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} class={['portrait', size ?? '', tint ? 'tint' : ''].filter(Boolean).join(' ')}>
      <img
        src={portraitUrl(roleKey)}
        alt=""
        decoding="async"
        onError={e => (e.currentTarget as HTMLImageElement).remove()}
      />
      {emoji}
    </button>
  );
}
