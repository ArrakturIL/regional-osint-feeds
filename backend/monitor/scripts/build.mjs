import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function assemble() {
  const { order } = JSON.parse(readFileSync(resolve(root, 'build-order.json'), 'utf8'));
  const strip = s =>
    s
      .replace(/^import\s+[^\n]+\n/gm, '')
      .replace(/^export (?=(?:const|let|var|function|async function) )/gm, '');
  return order.map(path => strip(readFileSync(resolve(root, 'src', path), 'utf8'))).join('');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  writeFileSync(resolve(root, 'dist/worker.js'), assemble());
  console.log(
    'Monitor Worker compatible source assembled from ' +
      JSON.parse(readFileSync(resolve(root, 'build-order.json'))).order.length +
      ' files',
  );
}
