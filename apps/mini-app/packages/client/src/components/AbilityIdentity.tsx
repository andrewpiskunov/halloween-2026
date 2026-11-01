import { ItemText } from './ItemText';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { portraitUrl } from '../assets';
import { content } from '../store';
import { portraitPreview } from './PortraitViewer';
import { BASE } from '../base';
import './ability-identity.css';

declare const __ABILITY_REVISIONS__: Record<string, string>;

/** Основной состав имеет собственные иллюстрации даров; дополнение использует портрет роли. */
export function abilityImageUrl(roleKey: string): string {
  return /^o(?:[1-9]|1[0-7])$/.test(roleKey)
    ? `${BASE}assets/abilities/${roleKey}.webp?v=${__ABILITY_REVISIONS__[roleKey]}`
    : portraitUrl(roleKey);
}

/** Иллюстрация открывается в том же просмотрщике, что и портрет; внутри кнопок действий остаётся декоративной. */
export function AbilityArt({ roleKey, name: providedName, small = false, preview = true }: { roleKey: string; name?: string; small?: boolean; preview?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [abilityImageUrl(roleKey), portraitUrl(roleKey)].find(url => !failed.includes(url));
  const name = providedName ?? content.value?.roles.find(r => r.key === roleKey)?.skill ?? 'Иллюстрация дара';
  const art = src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(previous => [...previous, src])}/> : <span>✦</span>;
  const cls = `ability-art${small ? ' small' : ''}`;
  if (!preview || !src) return <span class={cls} aria-hidden="true">{art}</span>;
  return <button type="button" class={`${cls} ability-art-preview`} aria-label={`Рассмотреть способность: ${name}`} title="Рассмотреть иллюстрацию"
    onClick={e => {e.preventDefault();e.stopPropagation();portraitPreview.value={roleKey,name,abilitySrc:src};}}
    onKeyDown={e => {if(e.key==='Enter'||e.key===' ')e.stopPropagation();}}>{art}</button>;
}

export function AbilityIdentity({ roleKey, name, children }: { roleKey: string; name: string; children?: ComponentChildren }) {
  return <div class="ability-identity"><AbilityArt roleKey={roleKey} name={name}/><div><h4>{name}</h4>{children && <div class="ability-tags">{children}</div>}</div></div>;
}

/** Происхождение — курсивом, действие в игре — отдельным блоком обычным шрифтом. */
export function AbilityDescription({ origin, text }: { origin?: string; text: ComponentChildren }) {
  return <div class="ability-description">
    {origin && <p class="ability-origin"><ItemText>{origin}</ItemText></p>}
    <div class="ability-mechanics"><span class="ability-caption">Действие в игре</span><p><ItemText>{text}</ItemText></p></div>
  </div>;
}
