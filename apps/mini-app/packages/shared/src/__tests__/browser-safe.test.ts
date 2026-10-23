import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(path);
    return e.name.endsWith('.ts') && e.name !== 'node.ts' ? [path] : [];
  });
}

test('корневой вход пакета не тянет импорты Node: в src (кроме node.ts и тестов) нет node:*', () => {
  const files = sources(SRC);
  expect(files.map(f => relative(SRC, f))).toContain('index.ts');
  const offenders = files.filter(f => /from\s+['"]node:|import\(\s*['"]node:|require\(\s*['"]node:/.test(readFileSync(f, 'utf8')));
  expect(offenders.map(f => relative(SRC, f))).toEqual([]);
});
