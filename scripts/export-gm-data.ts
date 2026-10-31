/** Снимок справочника: те же загрузчик, поправки и каталоги, что у Mini App. */
import { readFileSync } from 'node:fs';
import { loadContent } from '../apps/mini-app/packages/shared/src/content';
import { ABILITY_BY_ROLE, ABILITY_SPECS } from '../apps/mini-app/packages/shared/src/abilities';
import { GOALS } from '../apps/mini-app/packages/shared/src/goals';
import { OUTCOME_TEXTS, OUTCOME_TITLES } from '../apps/mini-app/packages/shared/src/closing-texts';
import { defaultRoster } from '../apps/mini-app/packages/shared/src/engine/roster';
const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const raw = read('../docs/design/game-data-v0.2.json');
const content = loadContent(raw, read('../apps/mini-app/content/2026-10-31.json'));
const roles = content.roles.map(r => ({ ...r, ability: ABILITY_SPECS[ABILITY_BY_ROLE[r.key]], goalConditions: GOALS[r.key],
  rosters: Array.from({length:19},(_,i)=>i+12).filter(n=>defaultRoster(content,n).includes(r.key)) }));
process.stdout.write(JSON.stringify({ ...raw, roles, outcomeTexts: OUTCOME_TEXTS, outcomeTitles: OUTCOME_TITLES,
  source: 'game-data-v0.2.json + content/2026-10-31.json + каталоги Mini App; не состояние сессии' }, null, 2)+'\n');
