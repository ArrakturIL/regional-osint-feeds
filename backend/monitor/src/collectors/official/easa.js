import { EASA } from '../../config/constants.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { href, textOnly } from '../../utils/text.js';
export async function airBulletins() {
  const xml = await get(EASA, 'text');
  const entries = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (!entries.length) throw new Error('EASA feed returned no items');
  const bulletins = entries.flatMap(([, entry]) => {
    const field = name =>
      textOnly(entry.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i'))?.[1]);
    const url = href(field('link'), EASA);
    const title = field('title');
    if (!url || !title) return [];
    return [
      item(url, {
        title,
        url,
        area: title,
        published: field('pubDate') || null,
        description: field('description') || null,
      }),
    ];
  });
  return bulletins.filter(({ payload }) =>
    /\b(iran|iraq|persian gulf|gulf of oman|hormuz|bahrain|kuwait|qatar|emirates|saudi arabia|oman)\b/i.test(
      payload.title,
    ),
  );
}
