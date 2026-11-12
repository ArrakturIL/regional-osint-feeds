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

if __name__=="__main__":unittest.main()
