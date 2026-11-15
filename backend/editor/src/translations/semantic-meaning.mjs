/**
 * Narrow, auditable semantic-risk checks for known high-impact translation
 * ambiguities. Not machine fact-checking: a non-null code only quarantines a
 * candidate for review. Source/target content is untrusted input.
 */
export function semanticMeaningIssue(sourceText,targetText) {
  const source=String(sourceText||''),target=String(targetText||'');
  if(!source.trim()||!target.trim())return null;

  // "To strike a naval mine" = collide with an explosive sea mine.
  // Neither "attack a mine" nor "hit a mining facility" is equivalent.
  // Maritime tanker headlines can omit the word "naval" even though "mines"
  // clearly refers to underwater explosives. The vessel + waterway context
  // narrows this check so ordinary labor/mineral mining is never classified.
  const vesselMineCollision= /\b(?:tankers?|vessels?|ships?)\b.{0,90}\b(?:strike|strikes|struck|hit|hits)\s+(?:a\s+|the\s+)?mines?\b/iu.test(source) &&
    /\b(?:Strait|Hormuz|Gulf|naval|sea|waters)\b/iu.test(source);
  const seaMine=/(?:\b(?:naval|sea)\s+mines?\b|морск[\p{L}]*\s+мин[\p{L}]*)/iu.test(source) || vesselMineCollision;
  if(seaMine) {
    if(/(?:шахт[а-яё]*|рудник[а-яё]*)/iu.test(target))
      return 'naval_mine_misread';
    if(/\b(?:strike|struck|hit|collid\w*\s+with)\s+(?:a\s+|the\s+)?(?:naval|sea)\s+mine\b/iu.test(source) &&
       /(?:^|[^\p{L}])(?:атак[а-яё]*|напад[а-яё]*|напал[а-яё]*|напас[а-яё]*|обстрел[а-яё]*)/iu.test(target))
      return 'mine_collision_reframed_as_attack';
    if(/[\u0590-\u05ff]/u.test(target) &&
      /מכרות|מכרה\b/u.test(target) && !/מוקש(?:ים)?/u.test(target))
      return 'naval_mine_misread';
    const collision=/(?:\b(?:strike|strikes|striking|struck|hit|hits|hitting|collid\w*\s+with)\s+(?:a\s+|the\s+)?(?:naval|sea)\s+mine\b|столкнул\w*\s+с\s+морск\w*\s+мин)/iu.test(source) || vesselMineCollision;
    if(collision && /(?:תקפו|תקפה|תקף|לתקוף|מתקיפ[\u0590-\u05ff]*|תוקף|תוקפת|תוקפים|תוקפות)\s+.{0,30}(?:מוקש|מכרה|מכרות)/u.test(target))
      return 'mine_collision_reframed_as_attack';
    if(collision && /\b(?:attacked|assaulted)\b|(?:напал\w*|атаковал\w*)\s+.{0,35}(?:мин\w*|шахт\w*)/iu.test(target))
      return 'mine_collision_reframed_as_attack';
  }

  // Keep US as the actor of a surprise strike feared by Israel, not
  // the object whom Israel intends to surprise.
  const fearedUSStrike=/(?:\bIsrael\b.{0,50}\bfears?\b.{0,60}\b(?:surprise|sudden)\s+(?:U\.?S\.?|American)\s+(?:air\s+)?strike\b|Израил[\p{L}]*\s+опаса[\p{L}]*.{0,70}внезапн[\p{L}]*\s+удар[\p{L}]*\s+США)/iu.test(source);
  if(fearedUSStrike && /(?:להפתיע|מפתיע\w*|מפתיעה)\s+את\s+(?:ארה[״"']?ב|ארצות\s+הברית)/u.test(target))
    return 'us_strike_actor_inverted';

  if(fearedUSStrike&&/Израил[а-яё]*.{0,55}(?:боится|опасается|опасался).{0,40}удивить\s+США/iu.test(target))
    return 'us_strike_actor_inverted';

  // English "barring further provocations" is a condition "unless", not
  // "forbade provocation". "May postpone" is a possibility, not a decision.
  const barring= /\bbarring\s+(?:any\s+|further\s+|new\s+){0,3}provocations?\b/iu.test(source);
  const isHebrew=/[\u0590-\u05ff]/u.test(target);
  if(barring && /[\u0400-\u04ff]/u.test(target)){
    const conditional=/(?:если\s+не|при\s+отсутствии|без\s+новых?\s+провокац|пока\s+не|при\s+условии\s+отсутствия)/iu.test(target);
    if(!conditional&&/(?:запретил|запретит|запрещае|запрет)/iu.test(target))
      return 'barring_condition_inverted';
    if(!conditional)return 'barring_condition_missing';
  }
  if(barring && isHebrew){
    const hasCondition=/(?:אם\s+לא|בתנאי\s+שלא|כל\s+עוד\s+לא|ללא\s+פרובוקציות|בהיעדר\s+פרובוקציות|אלא\s+אם)/u.test(target);
    if(!hasCondition && /(?:אסר|אסרה|אוסרת|לאסור|האיסור)/u.test(target))
      return 'barring_condition_inverted';
    if(!hasCondition)return 'barring_condition_missing';
  }
  const mayPostpone=/\bmay\s+(?:postpone|delay|defer)\b/iu.test(source);
  if(mayPostpone && /[\u0400-\u04ff]/u.test(target) &&
    !/(?:может|могут|возможно|вероятно|не исключает|допускает|предположительно)/iu.test(target))
    return 'conditional_modality_missing';
  if(mayPostpone && isHebrew &&
    !/(?:עשוי\w*|יכול\w*|ייתכן|יתכן|אפשרות|צפוי\w*|עשויה)/u.test(target))
    return 'conditional_modality_missing';

  return null;
}
