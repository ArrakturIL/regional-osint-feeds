// Q1 (QA 19.11): the output must be written in its target language's script.
// Production evidence: gemini-3.5-flash-lite put Arabic letters inside Hebrew
// words (ברצועة, להופعתו) in 17% of its Hebrew output; glm cut a JSON string at
// the ASCII quote of a Hebrew acronym (מכ"ם → "מכ"). Both passed every
// meaning check. Codes:
//   mixed_script_word — one word mixes Hebrew, Arabic or Cyrillic letters;
//   foreign_script    — a word in a script the target language does not use,
//                       unless the same word stands verbatim in the source
//                       (a channel name or a quote kept as is);
//   truncated_hebrew  — the text ends inside a Hebrew word: Hebrew words end
//                       with the final forms ך ם ן ף ץ, never with כ מ נ פ צ;
//                       acronyms (שב״כ) and Arabic transliteration (אל־מאלכ)
//                       can, so the text must also be clearly short: live
//                       truncations were 0.51–0.64 of the source length,
//                       complete translations ≥ 0.87 (p05 of all HE: 0.64).
const SCRIPTS = {
  he: /\p{Script=Hebrew}/u,
  ar: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
};
const FOREIGN = { he: ['ar', 'ru'], ru: ['he', 'ar'] };
const TRUNCATED_RATIO = 0.75;
const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

const scriptsOf = word => Object.keys(SCRIPTS).filter(k => SCRIPTS[k].test(word));

export function scriptIssue(source, translated, lang) {
  const t = String(translated || ''),
    s = String(source || '');
  const foreign = FOREIGN[lang];
  if (!foreign || !t.trim()) return null;
  const words = t.split(/\s+/).filter(Boolean);
  for (const word of words) if (scriptsOf(word).length > 1) return 'mixed_script_word';
  for (const word of words) {
    const core = word.replace(EDGE_PUNCT, '');
    if (!core || !scriptsOf(core).some(k => foreign.includes(k))) continue;
    if (!s.includes(core)) return 'foreign_script';
  }
  if (lang === 'he') {
    const last = words[words.length - 1];
    if (
      /[כמנפצ]$/u.test(last) &&
      !/[׳״'"]/u.test(last) &&
      t.trim().length < TRUNCATED_RATIO * s.trim().length
    )
      return 'truncated_hebrew';
  }
  return null;
}
