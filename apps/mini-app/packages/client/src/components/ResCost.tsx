import { useState } from 'preact/hooks';
import type { Ingredient } from '@fair/shared';
import { resourceImageUrl } from '../assets';
import { GOLD, INGREDIENTS } from '../labels';

type Key = 'gold' | Ingredient;
const INFO: Record<Key, { name: string; emoji: string }> = {
  gold: GOLD,
  ...Object.fromEntries(INGREDIENTS.map(i => [i.key, { name: i.name, emoji: i.emoji }])) as Record<Ingredient, { name: string; emoji: string }>,
};

/** Маленькая иконка ресурса (монета, пепел, пыль, роса) с названием в alt; эмодзи — если картинка не загрузилась. */
export function ResIcon({ res }: { res: Key }) {
  const [broken, setBroken] = useState(false);
  const { name, emoji } = INFO[res];
  return broken
    ? <span class="res-ico" role="img" aria-label={name}>{emoji}</span>
    : <img class="res-ico" src={resourceImageUrl(res)} alt={name} title={name} width={18} height={18} onError={() => setBroken(true)} />;
}

/** Набор ресурсов иконками: [пепел] 1 + [роса] 1 + [монета] 2. */
export function ResCost({ parts, sep = ' + ' }: { parts: [Key, number][]; sep?: string }) {
  return (
    <span class="res-cost">
      {parts.map(([res, n], i) => (
        <span key={res}>{i > 0 && sep}<ResIcon res={res} />{' '}{n}</span>
      ))}
    </span>
  );
}
