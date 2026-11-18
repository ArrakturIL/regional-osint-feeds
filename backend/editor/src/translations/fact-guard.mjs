import {ENTITIES} from './glossary.mjs';
import {translationIssue} from './verify.mjs';
/**
 * Deterministic fact-integrity gate for {title,body,comment} translations.
 *
 * A model's self-reported confidence does not demonstrate fidelity. Every field
 * is checked separately, so a name in the title cannot mask a wrong actor in
 * the body. Rules live in the shared verify (glossary + meaning invariants);
 * the target language follows the translation's script.
 */
const FIELDS = ['title', 'body', 'comment'];

export function factualTranslationIssue(original, candidate) {
  if (!original || !candidate) return 'missing_translation_object';
  for (const field of FIELDS) {
    const src = String(original[field] || '');
    if (!src) continue;
    const translated = String(candidate[field] ?? candidate[field === 'comment' ? 'commentary' : field] ?? '');
    const issue = translationIssue(src, translated);
    if (issue) return field + ':' + issue;
  }
  return null;
}

export const FACT_RULE_CODES = Object.freeze(ENTITIES.map(x => x.code));
