import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

test('клиент берёт из @fair/shared только типы: движок не попадает в сборку', () => {
  const files = sources(SRC);
  expect(files.length).toBeGreaterThan(5);
  const offenders = files.filter(f =>
    readFileSync(f, 'utf8').split('\n').some(line => /from\s+['"]@fair\/shared/.test(line) && !/^\s*import\s+type\s/.test(line)));
  expect(offenders.map(f => relative(SRC, f))).toEqual([]);
});
