// B3: the single translation verify. Every path that accepts a machine
// translation (scheduled HE, news mirror, read-time re-check, analysts) asks
// this one function, so a rule added once applies everywhere and per language.
//   entityIssue  — glossary: a named entity must keep its correct form;
//   meaningIssue — evidenced meaning invariants (false friends, polarity,
//                  modality, actor inversion).
//   scriptIssue  — the output is written in the target script (Q1, 19.11).
// Returns a stable code or null. Length and number checks stay with each
// caller because their limits differ by text kind.
import { entityIssue, targetLanguage, wikidataEntityIssue } from './glossary.mjs';
import { semanticMeaningIssue, MEANING_RULES } from './semantic-meaning.mjs';
import { scriptIssue } from './script-guard.mjs';

export { MEANING_RULES, targetLanguage };

export function translationIssue(source, translated, lang = targetLanguage(String(translated || ''))) {
  const s = String(source || ''),
    t = String(translated || '');
  if (!s.trim()) return null;
  return (
    scriptIssue(s, t, lang) ||
    entityIssue(s, t, lang) ||
    semanticMeaningIssue(s, t, lang) ||
    wikidataEntityIssue(s, t, lang)
  );
}
