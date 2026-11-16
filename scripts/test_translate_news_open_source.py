import unittest
from translate_news_open_source import valid,plan_jobs,build_mirror

class FreeTranslationTests(unittest.TestCase):
    def test_numbers_preserved(self):
        self.assertTrue(valid("Iran has 50 missiles","У Ирана 50 ракет","ru"))
        self.assertFalse(valid("Iran has 50 missiles","У Ирана 500 ракет","ru"))
        self.assertTrue(valid("1,700 ballistic missiles","1 700 баллистических ракет","ru") is False)
        self.assertFalse(valid("10 November 2026","10 ноября 2025 года","ru"))

    def test_domain_terms_and_malformed_output(self):
        self.assertFalse(valid("Iran retains 50 ballistic missiles","לאיראן 50 טילים טקטיים","he"))
        self.assertTrue(valid("Iran retains 50 ballistic missiles","לאיראן 50 טילים בליסטיים","he"))
        self.assertFalse(valid("Iran retains 50 ballistic missiles","Иран имеет 50 тактических ракет","ru"))
        self.assertTrue(valid("Iran retains 50 ballistic missiles","Иран имеет 50 баллистических ракет","ru"))
        self.assertFalse(valid("UK Green councilor shared anti-Jewish posts","חבר מועצה חלק דו״ח","he"))
        self.assertTrue(valid("UK Green councilor shared anti-Jewish posts","חבר מועצה שיתף פוסטים נגד יהודים","he"))
        self.assertFalse(valid("Iran has 50 missiles","Иран имеет 50 ракет. . . . . . .","ru"))
        self.assertFalse(valid("Iran says 50 missiles","Иран заявляет &quot; 50 ракет","ru"))

    def test_hebrew_and_actors(self):
        self.assertTrue(valid("Katz says Iran","כץ אומר על איראן","he"))
        self.assertFalse(valid("Katz says Iran","קטז אומר על איראן","he"))
        self.assertTrue(valid("IRGC launched a strike","משמרות המהפכה ביצעו תקיפה","he"))
        self.assertFalse(valid("IRGC launched a strike","חיל הים האיראני ביצע תקיפה","he"))
        self.assertFalse(valid("IDF said missile warning","המשטרה דיווחה על טיל","he"))

    def test_fact_fidelity_high_impact(self):
        self.assertFalse(valid("Canada sanctions Iranian entities",
            "קנדה מטילה סנקציות על ישויות ירדניות","he"))
        self.assertTrue(valid("Canada sanctions Iranian entities",
            "קנדה מטילה סנקציות על ישויות איראניות","he"))
        self.assertFalse(valid("Israeli strike on Gaza hospital kills six",
            "שביתה ישראלית בבית חולים בעזה הרגה שישה","he"))
        self.assertTrue(valid("Israeli strike on Gaza hospital kills six",
            "תקיפה ישראלית בבית חולים בעזה הרגה שישה","he"))
        self.assertFalse(valid("Katz: Caretaker govt fully responsible",
            "Кац: Временное правительство не несет полной ответственности","ru"))
        self.assertTrue(valid("Katz: Caretaker govt fully responsible",
            "Кац: Временное правительство несёт полную ответственность","ru"))

    def test_russian_and_native_hebrew_queue(self):
        items=[{"id":"a","source_language":"en","original_title":"Israel and Iran talk about peace",
                "original_summary":"Officials said talks continue.","need_ru":True,"need_he":True,"source":"BBC Middle East"},
               {"id":"b","source_language":"he","original_title":"ישראל ואיראן מנהלות שיחות",
                "original_summary":"ישראל מדברת על השיחות","need_ru":True,"need_he":False,"source":"Maariv"}]
        jobs=plan_jobs(items)
        self.assertEqual(set(jobs),{("en","ru"),("en","he"),("he","ru")})

    def test_mirror_validates_before_export(self):
        items=[{"id":"a","source_language":"en","original_title":"Iran retains 50 missiles",
                "original_summary":"Iran retained 50 missiles.","need_ru":True,"need_he":True,"source":"BBC Middle East"}]
        def fake(texts,model):
            return ["Иран сохраняет 50 ракет","Иран сохранил 50 ракет."] if model.endswith("en-ru") else [
                "איראן מחזיקה ב-50 טילים","איראן שומרת על 50 טילים"]
        mirror=build_mirror({"items":items},translator=fake)
        self.assertEqual(mirror["quality"]["accepted"],2)
        self.assertEqual(len(mirror["items"]),1)
        self.assertIn("ru",mirror["items"][0])
        self.assertIn("he",mirror["items"][0])

    def test_bad_model_output_skipped(self):
        items=[{"id":"x","source_language":"en","original_title":"Iran retains 50 missiles",
                "original_summary":"Iran retained 50 missiles.","need_ru":True,"need_he":False,"source":"BBC"}]
        mirror=build_mirror({"items":items},translator=lambda texts,model:["Иран сохраняет 500 ракет","Иран сохранил 50 ракет."])
        self.assertEqual(mirror["quality"]["rejected"],1)
        self.assertEqual(mirror["items"],[])


    def test_marine_mine_collision_never_becomes_tanker_attack_or_mining_facility(self):
        src="Two tankers strike a naval mine and catch fire"
        self.assertFalse(valid(src,"Два танкера нападают на мины и горят","ru"))
        self.assertFalse(valid(src,"שתי מכליות תקפו מכרות ועלו באש","he"))
        self.assertTrue(valid(src,"Два танкера столкнулись с морской миной и загорелись","ru"))
        self.assertTrue(valid(src,"שתי מכליות פגעו במוקש ימי ועלו באש","he"))

    def test_barring_is_a_condition_and_may_is_uncertainty(self):
        src="Trump may postpone strikes on Iran barring new provocations"
        self.assertFalse(valid(src,"Трамп запретил провокации и отложил удары по Ирану","ru"))
        self.assertFalse(valid(src,"טראמפ אסר פרובוקציות חדשות ודחה תקיפות באיראן","he"))
        self.assertTrue(valid(src,"Трамп может отложить удары по Ирану, если не будет новых провокаций","ru"))
        self.assertTrue(valid(src,"טראמפ עשוי לדחות תקיפות באיראן אם לא יהיו פרובוקציות חדשות","he"))

    def test_hebrew_actor_swap_from_feared_us_strike_is_quarantined(self):
        src="Israel fears surprise US strike on Iran"
        self.assertFalse(valid(src,"ישראל חוששת להפתיע את ארה״ב במכה באיראן","he"))
        self.assertTrue(valid(src,"ישראל חוששת מתקיפה פתאומית של ארה״ב באיראן","he"))

    def test_actual_reuters_may_hold_off_remains_uncertain_in_both_languages(self):
        src = "Trump tells advisers he may hold off on Iran attacks barring new provocations"
        self.assertFalse(valid(src, "Трамп отложил удары по Ирану, если не будет новых провокаций", "ru"))
        self.assertFalse(valid(src, "טראמפ דחה תקיפות באיראן אם לא יהיו פרובוקציות חדשות", "he"))
        self.assertTrue(valid(src, "Трамп может отложить удары по Ирану, если не будет новых провокаций", "ru"))
        self.assertTrue(valid(src, "טראמפ עשוי לדחות תקיפות באיראן אם לא יהיו פרובוקציות חדשות", "he"))


    def test_real_military_plural_strikes_never_become_labor_stoppages(self):
        samples = [
            ("Will Israel's repeated strikes on Hamas's replacement commanders lead to lasting change? - analysis",
             "האם שביתות חוזרות ונשנות של בני ישראל על מפקדיו המחליפים של חמאס יובילו לשינוי מתמשך? (אנליזה)"),
            ("Iran still has up to 2,500 missiles, capable of major assault even after rounds of strikes - report",
             "לאיראן עדיין יש עד 2,500 טילים, המסוגלים לתקוף אפילו אחרי סיבובי שביתות."),
            ("Iran can still produce 50 ballistic missiles a month, despite US-Israeli strikes - report",
             "איראן עדיין יכולה לייצר 50 טילים בליסטיים בחודש, למרות שביתות ארה״ב-ישראלית - דו״ח"),
        ]
        for original, candidate in samples:
            with self.subTest(original=original):
                self.assertFalse(valid(original,candidate,"he"))
        self.assertFalse(valid("Israeli strikes on Gaza, officials say",
                               "Израильские забастовки в Газе, заявили представители","ru"))

    def test_labor_strikes_and_correct_military_attacks_remain_allowed(self):
        self.assertTrue(valid("Teachers' strike shuts Israeli schools",
                              "שביתת המורים סוגרת את בתי הספר בישראל","he"))
        self.assertTrue(valid("Port workers stage strikes",
                              "Работники порта проводят забастовки","ru"))
        self.assertTrue(valid("Histadrut declares general strike in Israel",
                              "ההסתדרות מכריזה על שביתה כללית בישראל","he"))
        self.assertTrue(valid("Anti-Houthi forces retreat in Yemen as Iran strikes Bahrain",
                              "כוחות מתנגדי החות׳ים נסוגים בתימן בעוד איראן תוקפת בבחריין","he"))

if __name__=="__main__":unittest.main()
