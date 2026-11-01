import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Content } from '@fair/shared';

/** Полная книга загружается только сервером, не попадает в сборку Mini App. */
export function attachHiddenScenario(content: Content, path = fileURLToPath(new URL('../../../../../docs/design/gm-book/hidden-17.json', import.meta.url)), narrativeEnabled = true, continuousEnabled = true): Content {
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
    scenario.continuousFair = continuousEnabled;
  } else delete scenario.narrative;
  if (scenario.rulesVersion === 2 && scenario.narrative) {
    // Актуальные доказательства берутся из той же редакции, что личные источники.
    // Архивный справочник и переданный вызывающим кодом Content не изменяются.
    const roles = content.roles.map(role => {
      const current = scenario.narrative.roles[role.key];
      if (!current) return role;
      return {
        ...role,
        contacts: (current.acquaintances ?? []).map((person: { role: string; text: string }) => ({ role: person.role, text: person.text })),
        ...(role.key === 'o10' ? { effect: 'Снимите одно проклятие с другого игрока, если он согласен. Зелье не нужно. Дар распознаёт и изгоняет удерживающую человека чужую волю.' } : {}),
        ...(role.key === 'o6' ? { rumor: 'Старые проклятия иногда отзываются на очищающие травы; по одному признаку ещё нужно разобраться, что удерживает человека.' } : {}),
      };
    });
    const clues = content.clues.map(clue => {
      const text = scenario.narrative.items[`clue:${clue.id}`]?.description;
      if (typeof text !== 'string' || !text.trim()) throw new Error(`Нет актуального текста улики: ${clue.id}`);
      return { ...clue, text };
    });
    return { ...content, roles, roleByKey: Object.fromEntries(roles.map(role => [role.key, role])), clues, hidden17: scenario };
  }
  return { ...content, hidden17: scenario };
}
