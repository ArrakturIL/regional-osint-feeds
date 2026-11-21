import { createSourceIngestion } from './source-ingestion.mjs';
import { createAnalystQueue } from './queue-runner.mjs';
import { createAnalystDecision } from './editorial-decision.mjs';
import { readApi } from './public-api.mjs';
import { translatedForEditorial } from './translation.mjs';
import { readEditorCachedPair } from '../mirrors/collector-cache.mjs';
/** Regional Watch independent analyst editor.
 * No shared OSINT cron changes, no user interface modifications.
 * Sources are obtained via verified public GitHub collector mirror. Unsafe/absent
 * source text is never used to invent transcripts or auto-publish articles.
 */
const EDITOR_VERSION = 'analyst-editor-v1.1.2-translation';
const MODEL = '@cf/zai-org/glm-4.7-flash';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 21.11: 3 per hourly run fell behind Abu Ali Express (~4–5 long posts an hour);
// the daily cap and the shared AI pool still bound spending.
const MAX_AI_PER_RUN = 6;
const MAX_AI_PER_DAY = 60; // B1: ceiling only; shared AI pool decides
const REGION =
  /(?:израил|иран|цахал|сша|вашингтон|пентагон|трамп|байден|американск|ближн(?:ий|его) восток|хусит|хезболл|хамас|йемен|ливан|сири|ирак|ормуз|залив|саудов|катар|иордан|иерусалим|тегеран|хаменеи|нетаньяху|iran|israel|tehran|middle east|centcom|pentagon|hormuz|hezbollah|houthi|gaza|idf|us military)/i;
const PROMO =
  /(?:рекламная интеграция|на правах рекламы|промокод|скидк[аи]|покупайте|подписывайтесь на наш|для рекламы|заказать рекламу|впн.*скидк)/i;
// Reject unambiguous multilingual commercial ads before spending Workers AI neurons.
function isCommercialAd(text, language) {
  const s = String(text || '');
  if (language === 'he')
    return (
      [
        /(?:בלאק נובמבר|מבצעי|במבצעים|הנחות|מבצעי|קופון|חינם|ללא עלות)/u,
        /(?:קונים עכשיו|קונים|לכל מבצעי|להזמין|להזמנה|לרכישה|ספה|פינת אוכל|מיטה|להשאיר פרטים)/u,
      ].every(re => re.test(s)) ||
      // 21.11: «ב־2,290 ₪ בלבד במקום 2,990 ₪» with an order link.
      (/\d[\d,.]*\s*₪/u.test(s) && /(?:בלבד|במקום|להזמנה|להזמין|לרכישה)/u.test(s))
    );
  if (language === 'ru')
    return (
      /(?:промокод|на правах рекламы|рекламная интеграция|скидк|распродаж)/i.test(s) &&
      /(?:покупайте|закаж|товар|магазин|купить|продаж)/i.test(s)
    );
  if (language === 'en')
    return (
      /(?:discount|coupon|black friday|sale price)/i.test(s) &&
      /(?:buy now|shop now|order today|special offer)/i.test(s)
    );
  return false;
}
function plain(text, cap) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap);
}
function bodyWords(text) {
  return (
    String(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu) || []
  );
}
function similarity(a, b) {
  const aa = new Set(bodyWords(a)),
    bb = new Set(bodyWords(b));
  if (!aa.size || !bb.size) return 0;
  let same = 0;
  for (const x of aa) if (bb.has(x)) same++;
  return same / Math.min(aa.size, bb.size);
}
function assertString(v, min, max) {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}
function isoNow(ms) {
  return new Date(ms).toISOString();
}
const { sha256, readMirror, validateInput, insertItem } = createSourceIngestion({
  HOUR,
  DAY,
  plain,
  assertString,
});
const { validateDecision, aiDecision, reserveAi, decide } = createAnalystDecision({
  EDITOR_VERSION,
  MODEL,
  DAY,
  MAX_AI_PER_DAY,
  REGION,
  PROMO,
  isCommercialAd,
  plain,
  bodyWords,
  similarity,
  assertString,
  isoNow,
  translatedForEditorial,
});
const { prioritizePending, runEditor } = createAnalystQueue({
  EDITOR_VERSION,
  HOUR,
  DAY,
  MAX_AI_PER_RUN,
  REGION,
  plain,
  readEditorCachedPair,
  readMirror,
  sha256,
  validateInput,
  insertItem,
  decide,
});
export default {
  async scheduled(controller, env) {
    await runEditor(env, controller.scheduledTime);
  },
  async fetch(request, env) {
    return readApi(request, env, EDITOR_VERSION);
  },
};
export const testHooks = { plain, similarity, validateInput, validateDecision, reserveAi, aiDecision };
