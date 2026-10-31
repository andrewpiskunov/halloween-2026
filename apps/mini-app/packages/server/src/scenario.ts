import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Content } from '@fair/shared';

/** Полная книга загружается только сервером, не попадает в сборку Mini App. */
export function attachHiddenScenario(content: Content, path = fileURLToPath(new URL('../../../../../docs/design/gm-book/hidden-17.json', import.meta.url))): Content {
  const scenario = JSON.parse(readFileSync(path, 'utf8'));
  if (!scenario || typeof scenario !== 'object' || !scenario.roles || Object.keys(scenario.roles).length !== 17 || !scenario.ritual?.steps) {
    throw new Error('Некорректный сценарий для 17 игроков');
  }
  for (const key of Object.keys(scenario.roles)) {
    if (!Object.hasOwn(content.roleByKey, key)) throw new Error(`В содержимом нет роли сценария: ${key}`);
  }
  return { ...content, hidden17: scenario };
}
