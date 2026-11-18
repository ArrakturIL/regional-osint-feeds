import { MSCIO } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { href } from '../../utils/text.js';
export async function seaBulletins() {
  const html = await get(MSCIO, 'text');
  const links = new Map();
  for (const [, path] of html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
    const url = href(path, MSCIO);
    if (!url || !/\/media\/documents\//i.test(url)) continue;
    const doc = new URL(url);
    doc.search = '';
    links.set(
      doc.href,
      item(doc.href, {
        url: doc.href,
        area: 'regional maritime advisories',
        title: decodeURIComponent(doc.pathname.split('/').pop()),
      }),
    );
  }
  if (!links.size) throw new Error('MSCIO catalog returned no PDF links');
  return [...links.values()];
}
