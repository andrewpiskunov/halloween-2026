import { portraitUrl } from '../assets';

interface Props { roleKey: string; emoji: string; size?: 'sm' | 'big' }

/** Круглый портрет: эмодзи роли и картинка assets/portraits/<key>.jpg, если она есть. */
export function Portrait({ roleKey, emoji, size }: Props) {
  return (
    <span class={`portrait ${size ?? ''}`}>
      <img
        src={portraitUrl(roleKey)}
        alt=""
        onError={e => (e.currentTarget as HTMLImageElement).remove()}
      />
      {emoji}
    </span>
  );
}
