// Fail closed on editorial humour about death, injury, patients or humanitarian harm.
// Check both the original source and translations; a mistranslated title must not
// bypass policy. This is independent of the model prompt or its confidence.
const SENSITIVE_NEWS=[
  /\b(?:killed|killings?|dead|deaths?|died|dying|fatal(?:ity|ities)?|casualt(?:y|ies)|wounded|injur(?:ed|ies|y)|murder(?:ed)?|massacr(?:e|ed)|victims?|hostages?|slain|assassinat(?:ion|ed)|survivors?)\b/iu,
  /\b(?:hospitals?|patients?|surgeons?|doctors?|medics?|intensive\s+care|refugee\s+(?:camp|shelter)|humanitarian\s+(?:crisis|disaster))\b/iu,
  /(?:погиб[\p{L}]*|убит[\p{L}]*|смерт[\p{L}]*|умер[\p{L}]*|скончал[\p{L}]*|ранен[\p{L}]*|жертв[\p{L}]*|заложник[\p{L}]*|пострадавш[\p{L}]*|больниц[\p{L}]*|госпитал[\p{L}]*|реанимаци[\p{L}]*|пациент[\p{L}]*|хирург[\p{L}]*|врач[\p{L}]*|медик[\p{L}]*|гуманитарн[\p{L}]*\s+(?:катастроф|трагед|кризис))/iu,
  /(?:נהרג[\p{L}]*|נרצח[\p{L}]*|הרוג[\p{L}]*|פצוע[\p{L}]*|נפגע[\p{L}]*|חטופ[\p{L}]*|קורבנ[\p{L}]*|בית\s+חולים|רופא[\p{L}]*|מטופל[\p{L}]*|אונס)/iu
];
export function shouldSuppressComment(row){
  const text=['headline','summary','headline_ru','summary_ru','title','excerpt']
    .map(k=>row?.[k]).filter(v=>typeof v==='string'&&v.trim()).join(' ');
  return SENSITIVE_NEWS.some(rule=>rule.test(text));
}
export function safePublishedComment(row,comment){
  return shouldSuppressComment(row)?null:(comment??null);
}
