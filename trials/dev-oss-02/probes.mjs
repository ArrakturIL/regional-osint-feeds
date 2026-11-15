// Read-only A/B exploration with synthetic fixtures. Never writes sources or publishes data.
import {performance} from 'node:perf_hooks';
import {franc} from 'franc-min';
import {load} from 'cheerio';
import {Readability} from '@mozilla/readability';
import {JSDOM} from 'jsdom';
import {parseCentcomRss} from './candidate.mjs';
import {canonicalNewsUrl} from '../../backend/editor/src/news/normalization.mjs';

const samples=[
 {language:'en',expected:'eng',text:'The United Nations called for another meeting after diplomats reviewed the report. Officials stressed that no final decision has been taken, and all negotiations remain conditional.'},
 {language:'ru',expected:'rus',text:'Ведомство опубликовало новый доклад о ситуации на границе. Представители подчеркнули, что окончательное решение пока не принято, а сообщения требуют дополнительной проверки.'},
 {language:'he',expected:'heb',text:'משרד החוץ פרסם הודעה חדשה על המצב באזור הגבול. גורמים רשמיים הבהירו כי טרם התקבלה החלטה סופית וכי כל הדיווחים עדיין דורשים בדיקה נוספת.'},
 {language:'ar',expected:'arb',text:'أعلنت الوزارة اليوم عن تقرير جديد حول الوضع في المنطقة الحدودية. وأوضح المسؤولون أن القرار النهائي لم يتخذ بعد وأن المعلومات المتداولة ما زالت بحاجة إلى التحقق.'},
 {language:'mixed',expected:'unknown',text:'IDF צה״ל Reuters الجيش UN UN Reuters CIA Москвa'}
];
function scriptDetect(text){
  const counts={ru:(text.match(/[а-яё]/giu)||[]).length,he:(text.match(/[\u0590-\u05ff]/gu)||[]).length,ar:(text.match(/[\u0600-\u06ff]/gu)||[]).length,en:(text.match(/[a-z]/giu)||[]).length};
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return ranked[0][1]>=12 && ranked[0][1]>ranked[1][1]*2?ranked[0][0]:'unknown';
}
function microbench(fn,N=1000){
  const start=performance.now();for(let i=0;i<N;i++)fn();return +(performance.now()-start).toFixed(3);
}
const segments=Object.fromEntries(samples.slice(0,4).map(s=>[s.language,[...new Intl.Segmenter(s.language,{granularity:'sentence'}).segment(s.text)].length]));
const detected=samples.map(s=>({expected:s.expected,script:scriptDetect(s.text),franc:franc(s.text,{minLength:20})}));
const canonical=canonicalNewsUrl('https://example.org/article/77?utm_source=feed&ref=direct#video');
const newsHtml='<html lang="en"><head><title>Official long article</title></head><body><header>HEADER NAV</header><article><h1>Official long article</h1>'+Array(5).fill('<p>Officials said that their statement remained preliminary and did not confirm any military strike. The full public statement is available separately for verification.</p>').join('')+'</article><footer>FOOTER</footer></body></html>';
const $=load(newsHtml);
const cheerioText=$('article').text().replace(/\s+/g,' ').trim();
const doc=new JSDOM(newsHtml,{url:'https://example.org/statement'});
const readable=new Readability(doc.window.document).parse();
function overlapScore(a,b){
  const terms=t=>new Set((t.normalize('NFKC').toLowerCase().match(/[\\p{L}\\p{N}]+/gu)||[]));
  const x=terms(a),y=terms(b);
  return +([...x].filter(w=>y.has(w)).length/new Set([...x,...y]).size).toFixed(3);
}
const similarity={
  exact:overlapScore('IDF reports strike near Khan Younis','IDF reports strike near Khan Younis'),
  related:overlapScore('IDF reports strike near Khan Younis','IDF describes strike near Khan Younis'),
  contradictory:overlapScore('IDF confirms strike near Khan Younis','IDF denies strike near Khan Younis')
};
const centcomXml='<?xml version="1.0"?><rss><channel><item><title>Officials &amp; reporters</title><link>https://www.centcom.mil/NEWS/77</link><pubDate>Sun, 15 Nov 2026 19:00:00 GMT</pubDate></item></channel></rss>';
const ms=microbench(()=>parseCentcomRss(centcomXml,Date.parse('2026-11-15T20:00:00Z')));
console.log('RW_OSS02_PROBES '+JSON.stringify({versions:'pinned by trials/dev-oss-02/package.json',detected,segments,canonical,similarity,html:{cheerioChars:cheerioText.length,readabilityChars:readable?.textContent?.length??0,extractedTitle:readable?.title??null,jsdomRequired:true},xml:{nodeMsPer1000:ms,xmlTitle:parseCentcomRss(centcomXml,Date.parse('2026-11-15T20:00:00Z')).entries[0].payload.title},disclaimer:'synthetic fixtures, Node wall time not Workers CPU, no live source claims'}));
