import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Content } from '@fair/shared';

/** Полная книга загружается только сервером, не попадает в сборку Mini App. */
export function attachHiddenScenario(content: Content, path = fileURLToPath(new URL('../../../../../docs/design/gm-book/hidden-17.json', import.meta.url)), narrativeEnabled = true): Content {
  const scenario = JSON.parse(readFileSync(path, 'utf8'));
  if (!scenario || typeof scenario !== 'object' || !scenario.roles || Object.keys(scenario.roles).length !== 17 || !scenario.ritual?.steps) {
    throw new Error('Некорректный сценарий для 17 игроков');
  }
  for (const key of Object.keys(scenario.roles)) {
    if (!Object.hasOwn(content.roleByKey, key)) throw new Error(`В содержимом нет роли сценария: ${key}`);
  }
  const narrativePath = fileURLToPath(new URL('../../../../../docs/design/gm-book/narrative-17.json', import.meta.url));
  if (narrativeEnabled && existsSync(narrativePath)) {
    const narrative = JSON.parse(readFileSync(narrativePath, 'utf8'));
    if (narrative.version !== 2 || Object.keys(narrative.roles ?? {}).length !== 17 || !Array.isArray(narrative.documents)) throw new Error('Некорректная сюжетная редакция');
    for (const key of Object.keys(scenario.roles)) if (!Object.hasOwn(narrative.roles, key)) throw new Error(`Нет личной истории: ${key}`);
    scenario.narrative = narrative;
  } else delete scenario.narrative;
  return { ...content, hidden17: scenario };
}
