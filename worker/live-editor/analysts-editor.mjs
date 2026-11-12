import {translatedForEditorial} from './analysts-translation.mjs';
/** Regional Watch independent analyst editor.
 * No shared OSINT cron changes, no user interface modifications.
 * Sources are obtained via verified public GitHub collector mirror. Unsafe/absent
 * source text is never used to invent transcripts or auto-publish articles.
 */
const EDITOR_VERSION = 'analyst-editor-v1.1.2-translation';
const MODEL = '@cf/zai-org/glm-4.7-flash';
const MIRROR_BASE = 'https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_AI_PER_RUN = 3;
const MAX_AI_PER_DAY = 14;
const MAX_SOURCE_BYTES = 135_000;
const MAX_BODY = 6_500;
const REGION = /(?:израил|иран|цахал|сша|вашингтон|пентагон|трамп|байден|американск|ближн(?:ий|его) восток|хусит|хезболл|хамас|йемен|ливан|сири|ирак|ормуз|залив|саудов|катар|иордан|иерусалим|тегеран|хаменеи|нетаньяху|iran|israel|tehran|middle east|centcom|pentagon|hormuz|hezbollah|houthi|gaza|idf|us military)/i;
const PROMO = /(?:рекламная интеграция|на правах рекламы|промокод|скидк[аи]|покупайте|подписывайтесь на наш|для рекламы|заказать рекламу|впн.*скидк)/i;
const VALID_STATES = new Set(['full_text', 'metadata_only', 'truncated']);
// Reject unambiguous multilingual commercial ads before spending Workers AI neurons.
function isCommercialAd(text, language) {
  const s=String(text||'');
  if(language==='he')return [/(?:בלאק נובמבר|מבצעי|במבצעים|הנחות|מבצעי|קופון)/u,/(?:קונים עכשיו|קונים|לכל מבצעי|להזמין|לרכישה|ספה|פינת אוכל|מיטה)/u].every(re=>re.test(s));
  if(language==='ru')return /(?:промокод|на правах рекламы|рекламная интеграция|скидк|распродаж)/i.test(s)&&/(?:покупайте|закаж|товар|магазин|купить|продаж)/i.test(s);
  if(language==='en')return /(?:discount|coupon|black friday|sale price)/i.test(s)&&/(?:buy now|shop now|order today|special offer)/i.test(s);
  return false;
}
const CORS = {'Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=120'};

function plain(text, cap) { return String(text ?? '').replace(/\s+/g,' ').trim().slice(0,cap); }
function bodyWords(text) { return String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []; }
function similarity(a,b) {
  const aa = new Set(bodyWords(a)), bb = new Set(bodyWords(b));
  if (!aa.size || !bb.size) return 0;
  let same = 0; for (const x of aa) if (bb.has(x)) same++;
  return same / Math.min(aa.size,bb.size);
}
function assertString(v, min, max) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function isoNow(ms) { return new Date(ms).toISOString(); }
function json(value, status=200) {
  return Response.json(value,{status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'}});
}
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function readMirror(name) {
  if (!['analyst-source-items.json','analyst-source-status.json'].includes(name)) throw Error('invalid mirror path');
  const res=await fetch(MIRROR_BASE+name,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if (!res.ok) throw Error('mirror_http_'+res.status);
  const bytes=await res.arrayBuffer();
  if (bytes.byteLength>MAX_SOURCE_BYTES) throw Error('mirror_oversized');
  return JSON.parse(new TextDecoder().decode(bytes));
}
function validateInput(raw, source, analyst, now) {
  if (!raw || typeof raw!=='object' || raw.source_id!==source.id || raw.analyst_id!==analyst.id ||
      !assertString(raw.id,5,120) || !assertString(raw.canonical_url,16,350) ||
      !raw.id.startsWith(source.id+':') || !VALID_STATES.has(raw.text_status)) return null;
  if (!['ru','he','en'].includes(source.language||'ru') || (raw.language && raw.language!==(source.language||'ru')))return null;
  if (source.type==='telegram_public') {
    const prefix=source.canonical_prefix;
    if (!raw.canonical_url.startsWith(prefix) ||
        !/^\d+$/.test(raw.canonical_url.slice(prefix.length)) || raw.type!=='telegram_post') return null;
  } else if (source.type==='youtube_rss') {
    if (!raw.canonical_url.startsWith(source.canonical_prefix) ||
        !/^[\w-]{11}$/.test(raw.canonical_url.slice(source.canonical_prefix.length)) ||
        raw.type!=='youtube_video' || raw.text_status!=='metadata_only') return null;
  } else return null;
  const published=Date.parse(raw.published_at);
  if (!Number.isFinite(published) || published>now+HOUR*3 || published<now-DAY*7) return null;
  if (!assertString(raw.content_hash,64,64) || !/^[a-f0-9]{64}$/.test(raw.content_hash)) return null;
  if (typeof raw.body!=='string' || raw.body.length>MAX_BODY ||
      raw.body.includes('\u0000') || raw.body.includes('\u0001')) return null;
  if (raw.text_status==='full_text' && raw.body.length<5) return null;
  if (raw.text_status!=='full_text' && raw.type==='youtube_video' && raw.body.length) return null;
  return {id:raw.id, analyst_id:analyst.id, source_id:source.id,
    canonical_url:raw.canonical_url,published_at_ms:published,title:plain(raw.title,240),
    body:plain(raw.body,MAX_BODY),text_status:raw.text_status,content_hash:raw.content_hash,
    original_language:source.language||'ru',
    type:raw.type};
}
async function insertItem(db, it, now) {
  const got=await db.prepare(`INSERT OR IGNORE INTO analyst_items
      (id,analyst_id,source_id,canonical_url,source_type,source_published_at_ms,title,body,text_status,content_hash,state,created_at_ms)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(it.id,it.analyst_id,it.source_id,it.canonical_url,it.type,it.published_at_ms,
        it.title,it.body,it.text_status,it.content_hash,'pending',now).run();
  await db.prepare(`INSERT OR IGNORE INTO analyst_item_revisions(item_id,content_hash,body,discovered_at_ms)
      VALUES(?,?,?,?)`).bind(it.id,it.content_hash,it.body,now).run();
  const existing=await db.prepare('SELECT content_hash,state FROM analyst_items WHERE id=?').bind(it.id).first();
  if (existing && existing.content_hash!==it.content_hash) {
    // Keep  --- TRUNCATED --- 24,270 chars