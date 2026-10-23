interface Props { roleKey: string; emoji: string; size?: 'sm' | 'big' }

/** Круглый портрет: эмодзи роли и картинка assets/portraits/<key>.png, если она есть. */
export function Portrait({ roleKey, emoji, size }: Props) {
  return (
    <span class={`portrait ${size ?? ''}`}>
      <img
        src={`/assets/portraits/${roleKey}.png`}
        alt=""
        onError={e => (e.currentTarget as HTMLImageElement).remove()}
      />
      {emoji}
    </span>
  );
}
