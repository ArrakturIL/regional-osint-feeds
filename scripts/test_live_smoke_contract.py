import unittest
from scripts.test_live_regional_watch import targets


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


if __name__=="__main__":
    unittest.main()
