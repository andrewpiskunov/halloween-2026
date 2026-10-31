import { ItemText } from './ItemText';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { portraitUrl } from '../assets';
import { BASE } from '../base';
import './ability-identity.css';

/** Основной состав имеет собственные иллюстрации даров; дополнение использует портрет роли. */
export function abilityImageUrl(roleKey: string): string {
  return /^o(?:[1-9]|1[0-7])$/.test(roleKey)
    ? `${BASE}assets/abilities/${roleKey}.webp`
    : portraitUrl(roleKey);
}

/** Декоративная иллюстрация рядом с видимым названием способности. */
export function AbilityArt({ roleKey, small = false }: { roleKey: string; small?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [abilityImageUrl(roleKey), portraitUrl(roleKey)].find(url => !failed.includes(url));
  return <span class={`ability-art${small ? ' small' : ''}`} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(previous => [...previous, src])}/> : <span>✦</span>}
  </span>;
}

export function AbilityIdentity({ roleKey, name, children }: { roleKey: string; name: string; children?: ComponentChildren }) {
  return <div class="ability-identity"><AbilityArt roleKey={roleKey}/><div><h4>{name}</h4>{children && <div class="ability-tags">{children}</div>}</div></div>;
}

/** Происхождение — курсивом, действие в игре — отдельным блоком обычным шрифтом. */
export function AbilityDescription({ origin, text }: { origin?: string; text: ComponentChildren }) {
  return <div class="ability-description">
    {origin && <p class="ability-origin"><ItemText>{origin}</ItemText></p>}
    <div class="ability-mechanics"><span class="ability-caption">Действие в игре</span><p><ItemText>{text}</ItemText></p></div>
  </div>;
}
