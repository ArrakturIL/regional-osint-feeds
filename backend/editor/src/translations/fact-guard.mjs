import { ENTITIES, entityIssue } from './glossary.mjs';
import { semanticMeaningIssue } from './semantic-meaning.mjs';
/**
 * Deterministic fact-integrity gate for RU/EN -> HE translations.
 *
 * A model's self-reported confidence does not demonstrate fidelity. Reject
 * translations that omit known, unambiguous named entities or replace an actor.
 * This is a conservative supplement to editorial review, not semantic proof.
 *
 * Source and candidate are {title,body,comment} objects. All rules run per field
 * to prevent a name in the title masking an incorrect actor in the body.
 */
// B3: per-name rules moved to the shared entity glossary.
const FIELDS=['title','body','comment'];

export function factualTranslationIssue(original,candidate) {
  if(!original||!candidate)return 'missing_translation_object';
  for(const field of FIELDS){
    const src=String(original[field]||'');
    const translated=String(candidate[field]??candidate[field==='comment'?'commentary':field]??'');
    if(!src)continue;
    const entity=entityIssue(src,translated);
    if(entity)return field+':'+entity;
    const semanticIssue=semanticMeaningIssue(src,translated);
    if(semanticIssue)return field+':'+semanticIssue;
    // High-impact false-friend and entity substitutions seen in production.
    const sourceIran=/(?:\bIran(?:ian)?\b|Иран[\p{L}]*)/iu.test(src);
    const sourceJordan=/(?:\bJordan(?:ian)?\b|Иордан[\p{L}]*)/iu.test(src);
    if(sourceIran&&!sourceJordan&&/(?:ירד(?:ן|נ[\p{L}]*)|\bJordan(?:ian)?\b)/iu.test(translated))
      return field+':iran_replaced_with_jordan';
    if(/(?:\b(?:Israeli|IDF|Gaza|Hamas|military|air)\b.{0,90}\bstrike\b|\bstrike\b.{0,90}\b(?:Gaza|Hamas|hospital|killed|IDF)\b|(?:удар|авиаудар|обстрел)[\p{L}]*)/iu.test(src)
       &&/שבית[\p{L}]*/iu.test(translated))
      return field+':military_strike_misread_as_labor_action';
    if(/(?:\bfully\s+responsible\b|\bfull\s+responsibility\b|нес[её]т\s+полн[\p{L}]*\s+ответственн)/iu.test(src)
       &&/(?:לא|אינו|אינה|אינם)\s+[^.]{0,35}(?:אחראי|אחריות|נושא|נושאת)/iu.test(translated))
      return field+':responsibility_negation_inverted';
    // Ballistic and tactical missiles are not interchangeable. Keep the
    // weapon classification invariant in Hebrew as well as the number.
    if(/\bballistic\b|баллистическ/iu.test(src)&&!/בליסט/iu.test(translated))
      return field+':ballistic_missile_type_changed';
    // Known erroneous expansion of "RAF" to the Hebrew abbreviation for PM.
    if(/RAF\s+Fairford/iu.test(src)&&/רה[״"'׳]{1,3}ם/iu.test(translated))
      return field+':raf_expanded_to_prime_minister';
    // Never replace the IRGC actor with the Iranian navy when the source does
    // not mention the navy. The IRGC Navy is a distinct unit; do not infer it.
    if(/(?<![\p{L}])(?:КСИР|IRGC)(?![\p{L}])/iu.test(src)&&!/ВМС|военно-морск|Iranian navy|IRGC Navy/iu.test(src)
       &&/חיל\s+הים\s+האיראני/iu.test(translated))
      return field+':unsupported_iranian_navy_actor';
  }
  return null;
}

export const FACT_RULE_CODES=Object.freeze(ENTITIES.map(x=>x.code));
