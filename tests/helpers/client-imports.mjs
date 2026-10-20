import fs from 'node:fs';
import path from 'node:path';

const skipped = new Set(['node_modules', '.next', 'dist']);
function clientRoots(dir, found = []) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const file = path.join(dir, entry.name);
  if (entry.isDirectory()) { if (!skipped.has(entry.name)) clientRoots(file, found); }
  else if (/\.[jt]sx?$/.test(entry.name) && /^\s*['"]use client['"]/.test(fs.readFileSync(file, 'utf8'))) found.push(path.resolve(file));
 }
 return found;
}
const resolve = (from, spec) => {
 const base = spec.startsWith('@/') ? path.resolve(spec.slice(2)) : path.resolve(path.dirname(from), spec);
 return [base, base + '.ts', base + '.tsx', base + '.js', base + '/index.ts', base + '/index.tsx'].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
};
// Runtime imports only: `import type` and `import { type A, type B }` are erased from the bundle.
const imports = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)([^'"]*?)\s*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const typeOnly = names => /^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(names ?? '');

/** The import chains (`file <- importer <- … <- 'use client' file`) by which browser code reaches `target`. */
export function clientImportsOf(target) {
 const wanted = path.resolve(target), parent = new Map(), queue = [];
 for (const root of ['app', 'components', 'hooks', 'lib'].flatMap(dir => clientRoots(dir))) { parent.set(root, null); queue.push(root); }
 const chains = [];
 while (queue.length) {
  const file = queue.shift();
  for (const match of fs.readFileSync(file, 'utf8').matchAll(imports)) {
   const spec = match[2] ?? match[3];
   if (!spec.startsWith('.') && !spec.startsWith('@/') || typeOnly(match[1])) continue;
   const found = resolve(file, spec);
   if (found === wanted) { const chain = []; for (let at = file; at; at = parent.get(at)) chain.push(path.relative('.', at)); chains.push(chain.join(' <- ')); }
   if (!found || parent.has(found)) continue;
   parent.set(found, file); queue.push(found);
  }
 }
 return chains;
}
