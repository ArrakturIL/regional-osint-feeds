// B3: the single translation verify. Every path that accepts a machine
// translation (scheduled HE, news mirror, read-time re-check, analysts) asks
// this one function, so a rule added once applies everywhere and per language.
//   entityIssue  — glossary: a named entity must keep its correct form;
//   meaningIssue — evidenced meaning invariants (false friends, polarity,
//                  modality, actor inversion).
// Returns a stable code or null. Format checks (length, script, numbers) stay
// with each caller because their limits differ by text kind.
import {entityIssue, targetLanguage} from './glossary.mjs';
import {semanticMeaningIssue, MEANING_RULES} from './semantic-meaning.mjs';

export {MEANING_RULES, targetLanguage};

export function translationIssue(source, translated, lang = targetLanguage(String(translated || ''))) {
  const s = String(source || ''), t = String(translated || '');
  if (!s.trim()) return null;
  return entityIssue(s, t, lang) || semanticMeaningIssue(s, t, lang);
}
