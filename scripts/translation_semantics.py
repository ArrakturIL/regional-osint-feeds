"""Conservative source-to-translation meaning checks (no model/API calls).

Returns a risk code for human review. No rule can prove semantic correctness.
These patterns target recurring high-impact errors seen in independent QA and
apply to source classes rather than to any one article ID.
"""
from __future__ import annotations
import re




def military_strike_misread(source: str, target: str) -> bool:
    """Quarantine 'airstrikes/strikes' mapped to labor stoppages, not genuine unions."""
    src = str(source or "")
    dst = str(target or "")
    if not re.search(r"\b(?:strikes?|airstrikes?)\b", src, re.I):
        return False
    if not re.search(r"שבית\w*|забастовк\w*", dst, re.I):
        return False
    if re.search(r"\b(?:unions?|workers?|employees?|teachers?|doctors?|nurses?|pilots?|dockers?|labou?r|industrial|hunger|general|walk-?outs?|histadrut|wages?|pickets?)\b|профсоюз|забастов", src, re.I):
        return False
    return bool(re.search(r"\b(?:Israeli|Israel|Iran|Iranian|Hamas|IDF|Gaza|military|airstrikes?|aircraft|air|ballistic|missiles?|bombs?|bombing|attack|war|troops?|army|Hezbollah|IRGC|US|U\.S\.|American|Bahrain|hospital|killed|drones?|targets?|artillery)\b|(?:удар|авиаудар|обстрел)\w*", src, re.I))

def semantic_issue(source: str, target: str, language: str) -> str | None:
    src = str(source or "")
    dst = str(target or "")
    if not src.strip() or not dst.strip() or language not in {"ru", "he"}:
        return None
    if military_strike_misread(src, dst):
        return "military_strikes_misread_as_labor_action"

    sea_mine = re.search(r"\b(?:naval|sea)\s+mines?\b", src, re.I)
    collision = re.search(r"\b(?:strike|struck|hit|collided with)\s+(?:a\s+|the\s+)?(?:naval|sea)\s+mine\b", src, re.I)
    if sea_mine:
        if language == "ru":
            if re.search(r"шахт\w*|рудник\w*", dst, re.I):
                return "naval_mine_as_mining_facility"
            if collision and re.search(r"атак\w*|напад\w*|обстрел\w*", dst, re.I):
                return "mine_collision_as_attack"
            if not re.search(r"мин\w*", dst, re.I):
                return "naval_mine_omitted"
        if language == "he":
            if re.search(r"מכרה|מכרות", dst) and not re.search(r"מוקש", dst):
                return "naval_mine_as_mining_facility"
            if collision and re.search(r"תקפו|תקף|תקפה|לתקוף", dst):
                return "mine_collision_as_attack"
            if not re.search(r"מוקש", dst):
                return "naval_mine_omitted"

    feared_us_strike = re.search(
        r"\bIsrael\b.{0,50}\bfears?\b.{0,60}\b(?:surprise|sudden)\s+(?:U\.?S\.?|American)\s+(?:air\s+)?strike\b",
        src, re.I,
    )
    if feared_us_strike and language == "he":
        if re.search(r"(?:להפתיע|מפתיע|מפתיעה)\s+את\s+(?:ארה[״\"']?ב|ארצות\s+הברית)", dst):
            return "us_strike_actor_inverted"

    barring = re.search(r"\bbarring\s+(?:(?:any|further|new)\s+){0,3}provocations?\b", src, re.I)
    if barring:
        if language == "ru":
            conditional = re.search(r"если\s+не|при\s+отсутствии|без\s+новых?\s+провокац|пока\s+не|при\s+условии\s+отсутствия", dst, re.I)
            if not conditional and re.search(r"запрет\w*|запретил\w*|воспрет\w*", dst, re.I):
                return "barring_as_prohibition"
            if not conditional:
                return "barring_condition_missing"
        if language == "he":
            conditional = re.search(r"אם\s+לא|בתנאי\s+שלא|כל\s+עוד\s+לא|ללא\s+פרובוקציות|בהיעדר\s+פרובוקציות|אלא\s+אם", dst)
            if not conditional and re.search(r"אסר|אסרה|אוסרת|לאסור|האיסור", dst):
                return "barring_as_prohibition"
            if not conditional:
                return "barring_condition_missing"

    may_postpone = re.search(r"\b(?:may|might|could)\s+(?:postpone|delay|defer|hold\s+off)\b", src, re.I)
    if may_postpone:
        if language == "ru" and not re.search(r"может|могут|возможно|вероятно|допускает|не исключает|предположительно", dst, re.I):
            return "uncertain_modality_lost"
        if language == "he" and not re.search(r"עשוי|עשויה|עשויים|יכול|יכולה|ייתכן|יתכן|אפשרות|צפוי", dst):
            return "uncertain_modality_lost"

    return None
