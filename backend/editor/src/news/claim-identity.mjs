/**
 * Evidence identity and claim attribution. Matches an episode, never verifies
 * its factual truth. No individual or publication is hardcoded.
 */
const Hamas=/\bhamas\b|חמאס|حماس|хамас/iu;
const Target=/\b(?:senior|commander|brigade|chief|high.ranking)\b|בכיר|מפקד|חטיב|командир|бригад/iu;
const Attack=/\b(?:strike|struck|targeted|killed|attack|hit|raid)\b|תקף|תקיפה|חוסל|פגע|удар|атак|ликвидир/iu;
const LatinName=/\b[A-Z][a-z]{2,}\s+Abu\s+[A-Z][a-z]{2,}\b/g;
const HebrewName=/[\u0590-\u05ff]{2,}\s+אבו\s+[\u0590-\u05ff]{2,}/g;
const letters={א:'',ב:'b',ג:'g',ד:'d',ה:'h',ו:'w',ז:'z',ח:'h',ט:'t',י:'y',כ:'k',ך:'k',ל:'l',מ:'m',ם:'m',נ:'n',ן:'n',ס:'s',ע:'',פ:'p',ף:'p',צ:'ts',ץ:'ts',ק:'k',ר:'r',ש:'sh',ת:'t'};
const sourceText=x=>String(x.title||x.headline||'')+' '+String(x.summary||'').split(/\s+\*\s+/u,1)[0];
const fingerprint=x=>[...x.normalize('NFKC').toLowerCase()].map(c=>letters[c]??c).join('').replace(/[^a-z ]/g,'').replace(/[aeiouyw]/g,'').replace(/\s+/g,' ').trim();
export function namedTargets(x){
 const source=sourceText(x);
 return new Set([...source.matchAll(LatinName),...source.matchAll(HebrewName)].map(m=>fingerprint(m[0])).filter(n=>n.length>4));
}
function isSeniorHamas(x){
 const text=sourceText(x);
 return Hamas.test(text)&&Target.test(text)&&Attack.test(text);
}
export function distinctNamedTargets(a,b){
 if(!isSeniorHamas(a)||!isSeniorHamas(b))return false;
 const namesA=namedTargets(a),namesB=namedTargets(b);
 return !!(namesA.size&&namesB.size&&![...namesA].some(n=>namesB.has(n)));
}
export function relatedSeniorTarget(a,b,hours){
 if(!Number.isFinite(hours)||hours>4||hours<0||!isSeniorHamas(a)||!isSeniorHamas(b)||distinctNamedTargets(a,b))return false;
 const namesA=namedTargets(a),namesB=namedTargets(b);
 if(namesA.size&&namesB.size)return [...namesA].some(n=>namesB.has(n));
 // A single unnamed military bulletin may join a recent named incident.
 return (namesA.size||namesB.size)?hours<=4:hours<=2;
}
export function reportingClaim(x){
 const text=sourceText(x);
 const unconfirmed=/\b(?:IDF|military)\b.{0,60}\b(?:had not yet|has not|did not|not yet|not)\s+(?:officially\s+)?confirm(?:ed)?\b.{0,45}\b(?:death|killing|dead)\b|צה.ל.{0,45}לא\s+אישר/iu.test(text);
 const deathTerms=/\b(?:killed|death|slain|died|fatality)\b|חוסל|נהרג|מותו|убит|погиб|ликвидир/iu;
 const head=String(x.title||x.headline||''),summary=String(x.summary||'');
 // A prior killing cited as context does not assert fatalities in the
 // reported administrative action or statement.
 const historic=/\b(?:last|previous)\s+(?:week|month|year)\b|\b(?:weeks?|months?|years?)\s+(?:earlier|ago|after)\b/iu.test(summary);
 const death=deathTerms.test(head)||(!historic&&deathTerms.test(summary));
 return {claimed_by:String(x.source||''),claim_about_death:unconfirmed?'death_not_confirmed_by_idf':death?'reported_death':'not_reported'};
}
