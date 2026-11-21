import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function assembleStyles({ includeRefinements = true } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(frontendRoot, 'styles-order.json'), 'utf8'));
  if (!Array.isArray(manifest.order) || manifest.order.length < 20)
    throw Error('Invalid ordered CSS sources');
  const seen = new Set();
  let css = '';
  for (const path of manifest.order) {
    if (!/^(components|pages|styles)\/[a-zA-Z0-9./-]+\.css$/.test(path) || path.includes('..'))
      throw Error('Invalid CSS path: ' + path);
    if (seen.has(path)) throw Error('Duplicate CSS source: ' + path);
    seen.add(path);
    css += readFileSync(resolve(frontendRoot, 'src', path), 'utf8');
  }
  if (includeRefinements) {
    css += readFileSync(resolve(frontendRoot, 'src/styles/refinements.css'), 'utf8');
    // Formerly duplicated in each RU/HE document; loaded after the original CSS.
    css += readFileSync(resolve(frontendRoot, 'src/styles/document-shell.css'), 'utf8');
    css += readFileSync(resolve(frontendRoot, 'src/components/NewsMasonry/NewsMasonry.layout.css'), 'utf8');
    css += readFileSync(resolve(frontendRoot, 'src/components/NewsArchive/NewsArchive.filters.css'), 'utf8');
    css += readFileSync(resolve(frontendRoot, 'src/components/Digest/Digest.qa.css'), 'utf8');
    css += readFileSync(resolve(frontendRoot, 'src/components/FeedState/FeedState.css'), 'utf8'); // F-04
    css += themeWithFonts(); // redesign «2077»
    // Concept E components, written clean; they come after the theme layer.
    css += readFileSync(resolve(frontendRoot, 'src/components/Header/Header.css'), 'utf8');
    css += readFileSync(resolve(frontendRoot, 'src/components/HomeHero/HomeHero.css'), 'utf8');
  }
  return css;
}

// Self-hosted variable fonts (OFL, frontend/vendor/fonts): each URL carries a
// hash of the file, so Pages serves it immutable like the other assets.
export const FONT_DIR = resolve(frontendRoot, 'vendor/fonts');
export function fontFiles() {
  return readdirSync(FONT_DIR)
    .filter(f => f.endsWith('.woff2'))
    .sort();
}
export function fontUrl(file) {
  return (
    '/assets/fonts/' +
    file +
    '?v=' +
    createHash('sha256')
      .update(readFileSync(resolve(FONT_DIR, file)))
      .digest('hex')
      .slice(0, 12)
  );
}
export function themeWithFonts() {
  const css = readFileSync(resolve(frontendRoot, 'src/styles/theme-2077.css'), 'utf8');
  const out = css.replace(/__FONT_([a-z0-9-]+)__/g, (m, name) => fontUrl(name + '.woff2'));
  if (/__FONT_/.test(out)) throw Error('unresolved font placeholder');
  return out;
}
