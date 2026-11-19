import unittest
from scripts.test_live_regional_watch import targets, analyst_locale_issue


class CanonicalPagesSmokeTests(unittest.TestCase):
    def test_uses_canonical_localized_news_apis_instead_of_removed_alias(self):
        urls=targets()
        self.assertIn("site_he_news",urls)
        self.assertIn("site_ru_news",urls)
        self.assertIn("/api/news?lang=he",urls["site_he_news"])
        self.assertIn("/api/news?lang=ru",urls["site_ru_news"])
        self.assertNotIn("/api/he/news",urls["site_he_news"])

    def test_public_smoke_does_not_depend_on_private_api(self):
        urls=targets()
        self.assertTrue(all("/api/translation-queue" not in value for key,value in urls.items() if key.startswith("site_")))
        self.assertTrue(all(url.startswith("https://") for url in urls.values()))


class AnalystLocaleContractTests(unittest.TestCase):
    def test_he_may_hide_untranslated_posts_but_keeps_order(self):
        # Live 18.11 07:41 and 20:40 UTC: RU 40 posts, HE without 4 untranslated.
        self.assertIsNone(analyst_locale_issue(["a","b","c","d"],["a","c","d"],1))
        self.assertIsNone(analyst_locale_issue(["a","b"],["a","b"],0))

    def test_real_drift_still_fails(self):
        self.assertEqual(analyst_locale_issue(["a","b","c"],["c","a"],1),"analyst post order differs across locales")
        self.assertEqual(analyst_locale_issue(["a","b"],["a","x"],1),"analyst HE post missing from RU list")
        self.assertEqual(analyst_locale_issue(["a","b","c"],["a"],0),"analyst HE posts missing without withheld_count")


if __name__=="__main__":
    unittest.main()
