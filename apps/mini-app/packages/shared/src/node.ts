// Точка входа только для Node (сервер, тесты): здесь допустимы импорты node:*.
import { fileURLToPath } from 'node:url';

/** Путь к game-data-v0.2.json в корне репозитория (от расположения пакета shared). */
export function defaultContentPath(): string {
  return fileURLToPath(new URL('../../../../../docs/design/game-data-v0.2.json', import.meta.url));
}
