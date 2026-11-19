"""B11 part 1: offline checks of the Wikidata glossary builder."""
import unittest

from scripts.build_wikidata_glossary import build, forms_for, keep, load_config, render


def entity(qid, title, en, ru, he, aliases=None):
    aliases = aliases or {}
    return qid, {
        "labels": {"en": {"value": en}, "ru": {"value": ru}, "he": {"value": he}},
        "aliases": {k: [{"value": v} for v in vs] for k, vs in aliases.items()},
        "sitelinks": {"enwiki": {"title": title}},
    }


class TestForms(unittest.TestCase):
    def test_noisy_forms_are_dropped(self):
        self.assertTrue(keep("US", "en"), "acronyms stay (matched case-sensitively)")
        self.assertFalse(keep("us", "en"))
        self.assertFalse(keep("the States", "en"))
        self.assertFalse(keep("Iran (country)", "en"))
        self.assertFalse(keep("IL-972", "en"))
        self.assertFalse(keep("Iran", "ru"), "Latin form is not a Russian form")
        self.assertFalse(keep("עז", "he"), "two Hebrew letters match too much")
        self.assertTrue(keep("עזה", "he"))

    def test_niqqud_stripped_duplicates_removed_and_capped(self):
        qid, e = entity("Q1", "X", "Gaza", "Газа", "עַזָּה", {"he": ["עזה"], "en": ["Gaza " + str(i) for i in range(3)] + ["GAZA"]})
        forms = forms_for(e)
        self.assertEqual(forms["he"], ["עזה"])
        self.assertEqual(forms["en"], ["Gaza"], "digits and case duplicates dropped")


class TestBuild(unittest.TestCase):
    def test_entities_resolved_by_enwiki_title_in_config_order(self):
        def fetcher(titles):
            items = dict([
                entity("Q794", "Iran", "Iran", "Иран", "איראן", {"en": ["Islamic Republic of Iran"]}),
                entity("Q801", "Israel", "Israel", "Израиль", "ישראל"),
            ])
            return {"entities": {q: e for q, e in items.items() if e["sitelinks"]["enwiki"]["title"] in titles}}
        out = build([("israel", "Israel"), ("iran", "Iran")], fetcher=fetcher)
        self.assertEqual([(e["id"], e["qid"]) for e in out], [("israel", "Q801"), ("iran", "Q794")])
        self.assertEqual(out[1]["en"], ["Iran", "Islamic Republic of Iran"])
        self.assertIn("export const WIKIDATA_ENTITIES", render(out, "2026-11-19"))

    def test_missing_item_or_language_fails_loudly(self):
        with self.assertRaises(ValueError):
            build([("x", "Nowhere")], fetcher=lambda t: {"entities": {"-1": {"missing": ""}}})
        self.assertEqual(build([("x", "X")], fetcher=lambda t: {"entities": dict([entity("Q9", "X", "Xland", "", "")])}), [],
                         "an entity without RU/HE forms is skipped with a warning")

    def test_config_ids_are_unique(self):
        ids = [e[0] for e in load_config()]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
