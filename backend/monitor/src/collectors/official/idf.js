import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { textOnly } from '../../utils/text.js';
export const IDF_TELEGRAM_URL = "https://t.me/s/idfofficial";
export async function idfReleases() {
  const html = await get(IDF_TELEGRAM_URL,"text");
  if (!html.includes("tgme_widget_message")) throw new Error("unexpected official IDF Telegram channel response");
  const entries = [];
  for (const chunk of html.split(/<div\s+class="tgme_widget_message_wrap[^"]*"[^>]*>/i).slice(1)) {
    const key = chunk.match(/\bdata-post="(idfofficial\/\d+)"/i)?.[1];
    if (!key) continue;
    const fragment = chunk.match(/<div\s+class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const summary = textOnly(fragment);
    if (!summary) continue;
    const timestamp = chunk.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || null;
    entries.push(item(key, {
      url: "https://t.me/" + key, title: summary.slice(0,180),
      excerpt: summary.slice(0,400), published_at: timestamp,
      source_channel: IDF_TELEGRAM_URL, source_type:"official_idf_telegram",
      caveat:"Public official IDF channel; not exhaustive and not a substitute for Home Front Command emergency alerts."
    }));
    if (entries.length >= 30) break;
  }
  if (!entries.length) throw new Error("unexpected IDF Telegram post format");
  return entries;
}

