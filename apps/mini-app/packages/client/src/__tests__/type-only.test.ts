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

test('клиент берёт только типы и изолированные публичные правила: движок не попадает в сборку', () => {
  const files = sources(SRC);
  expect(files.length).toBeGreaterThan(5);
  const offenders = files.filter(f =>
    readFileSync(f, 'utf8').split('\n').some(line => /from\s+['"]@fair\/shared/.test(line) && !/^\s*import\s+type\s/.test(line) && !/from\s+['"]@fair\/shared\/final-rules['"]/.test(line)));
  expect(offenders.map(f => relative(SRC, f))).toEqual([]);
});

// Разрешённый entry не импортирует движок, сценарий или содержимое во время исполнения.
test('публичные правила изолированы от содержимого игры',()=>{
 const rules=readFileSync(new URL('../../../shared/src/final-rules.ts',import.meta.url),'utf8');
 const imports=rules.split('\n').filter(line=>/^\s*import\s/.test(line));
 expect(imports.every(line=>/^\s*import\s+type\s/.test(line))).toBe(true);
 expect(rules).not.toMatch(/import\s*\(|require\s*\(/);
});
