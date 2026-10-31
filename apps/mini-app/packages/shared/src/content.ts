import type { Counts, Side } from './types';

export interface Faction { id: Side; name: string; color: string; desc: string; motto: string; altar: string | null }
export interface Contact { role: string | null; text: string }
export interface Acting { vibe: string; voice: string; look: string; actions: string[]; lines: string[]; portrait: string }
export interface Role {
  key: string; id: number | null; pos: number; block: string; side: Side;
  name: string; title: string; intro: string; goals: string[];
  skill: string; effect: string; extra: string; bundle: Counts;
  contacts: Contact[]; joke: string; style: string; acting: Acting;
  secret: string; rumor: string; backstory: string; motivation: string; emoji: string;
  /** Женская роль с именем не на -а/-я (Сив): без поля клиент судит о роде по окончанию имени. */
  female?: boolean;
}

/** Поправки к содержимому на конкретный вечер: поля ролей по ключу. `acting` сливается по полям, остальные поля заменяются целиком. */
export interface ContentPatch {
  roles?: Record<string, Partial<Omit<Role, 'key' | 'acting'>> & { acting?: Partial<Acting> }>;
}
export interface Relic { name: string; owner: string; wants: string[]; lore: string; emoji: string }
export interface Shard { id: string; owner?: string; hidden?: string; lot?: number }
export interface Clue { id: string; name: string; where: string; text: string; emoji: string }
export interface Recipe { id: string; name: string; symbol: string; cost: Partial<Counts>; gold: number; text: string; lore: string; emoji: string }
export interface GameEvent { when: string; title: string; text: string }
export interface Resource { id: string; symbol: string; name: string; lore: string; emoji: string }
export interface Room { id: string; title: string; name: string; people: string; color: string; text: string; game: string; group: string; props: string; app: string }
export interface Story { public: string; truth: string; truth_read: string }

export interface Content {
  hidden17?: import('./hidden17').HiddenContent;
  version: string;
  factions: Faction[];
  roles: Role[];
  relics: Relic[];
  shards: Shard[];
  clues: Clue[];
  recipes: Recipe[];
  events: GameEvent[];
  resources: Resource[];
  story: Story;
  rooms: Room[];
  icons: Record<string, string>;
  roleByKey: Record<string, Role>;
  recipeById: Record<string, Recipe>;
}

/** Содержимое без индексов: так оно уходит клиенту (индексы дублируют roles и recipes). */
export type ContentData = Omit<Content, 'roleByKey' | 'recipeById'>;

/** Содержимое для отправки клиенту: без индексов roleByKey и recipeById. */
export function contentData(content: Content): ContentData {
  const { roleByKey: _r, recipeById: _rc, ...data } = content;
  return data;
}

const ARRAYS = ['factions', 'roles', 'relics', 'shards', 'clues', 'recipes', 'events', 'resources', 'rooms'] as const;
const ROLE_STRINGS = ['key', 'block', 'side', 'name', 'title', 'intro', 'skill', 'effect', 'extra', 'joke', 'style', 'secret', 'rumor', 'backstory', 'motivation', 'emoji'] as const;

function fail(msg: string): never {
  throw new Error(`Некорректное содержимое игры: ${msg}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkRole(r: unknown, i: number): void {
  if (!isObject(r)) fail(`роль #${i} не объект`);
  for (const f of ROLE_STRINGS) if (typeof r[f] !== 'string') fail(`у роли #${i} нет строки «${f}»`);
  if (typeof r.pos !== 'number') fail(`у роли ${String(r.key)} нет числа «pos»`);
  if (!Array.isArray(r.goals)) fail(`у роли ${String(r.key)} нет «goals»`);
  if (!Array.isArray(r.contacts)) fail(`у роли ${String(r.key)} нет «contacts»`);
  if (!isObject(r.bundle)) fail(`у роли ${String(r.key)} нет «bundle»`);
  if (!isObject(r.acting)) fail(`у роли ${String(r.key)} нет «acting»`);
  if (r.female !== undefined && typeof r.female !== 'boolean') fail(`у роли ${String(r.key)} «female» не булево`);
}

/** Накладывает поправки на сырой JSON до проверки: роли ищутся по ключу, неизвестный ключ это ошибка. Исходный объект не меняется. */
export function applyContentPatch(json: unknown, patch: unknown): unknown {
  if (!isObject(patch)) fail('поправки не объект');
  if (patch.roles === undefined) return json;
  if (!isObject(patch.roles)) fail('в поправках «roles» не объект');
  if (!isObject(json) || !Array.isArray(json.roles)) fail('нет массива «roles»');
  const roles = json.roles.map(r => (isObject(r) ? { ...r } : r)) as Record<string, unknown>[];
  for (const [key, over] of Object.entries(patch.roles)) {
    if (!isObject(over)) fail(`поправка к роли «${key}» не объект`);
    const role = roles.find(r => isObject(r) && r.key === key);
    if (!role) fail(`поправка к неизвестной роли «${key}»`);
    const { key: _k, acting, ...rest } = over;
    Object.assign(role, rest);
    if (acting !== undefined) {
      if (!isObject(acting) || !isObject(role.acting)) fail(`у поправки к роли «${key}» «acting» не объект`);
      role.acting = { ...role.acting, ...acting };
    }
  }
  return { ...json, roles };
}

function checkRecipe(r: unknown, i: number): void {
  if (!isObject(r)) fail(`рецепт #${i} не объект`);
  if (typeof r.id !== 'string') fail(`у рецепта #${i} нет «id»`);
  if (typeof r.gold !== 'number') fail(`у рецепта ${r.id} нет числа «gold»`);
  if (!isObject(r.cost)) fail(`у рецепта ${r.id} нет «cost»`);
}

/** Проверяет структуру JSON игры вручную и строит индексы по ключу роли и id рецепта. Поправки (`patch`) накладываются до проверки. */
export function loadContent(json: unknown, patch?: unknown): Content {
  if (patch !== undefined) json = applyContentPatch(json, patch);
  if (!isObject(json)) fail('корень не объект');
  if (typeof json.version !== 'string') fail('нет «version»');
  for (const name of ARRAYS) if (!Array.isArray(json[name])) fail(`нет массива «${name}»`);
  if (!isObject(json.story)) fail('нет «story»');
  if (!isObject(json.icons)) fail('нет «icons»');

  (json.roles as unknown[]).forEach(checkRole);
  (json.recipes as unknown[]).forEach(checkRecipe);

  const content = json as unknown as Content;
  const roleByKey: Record<string, Role> = {};
  for (const r of content.roles) {
    if (roleByKey[r.key]) fail(`повторяется ключ роли «${r.key}»`);
    roleByKey[r.key] = r;
  }
  const recipeById: Record<string, Recipe> = {};
  for (const r of content.recipes) recipeById[r.id] = r;
  return { ...content, roleByKey, recipeById };
}
