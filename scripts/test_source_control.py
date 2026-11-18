import unittest

from scripts.source_control import load_config, plan, UPSERT_SQL, DELETE_SQL, LIST_SQL, SCHEMA_SQL


class SourceControlPlan(unittest.TestCase):
    def setUp(self):
        self.c = load_config()

    def test_disable_writes_one_bounded_row_with_expiry(self):
        st = plan(self.c, "monitor", "disable", "mil_lol", "  adsb.fi\n403 ", "6", 1000)
        self.assertEqual([s for s, _ in st], [SCHEMA_SQL, UPSERT_SQL, LIST_SQL])
        self.assertEqual(st[1][1], ("mil_lol", "adsb.fi 403", str(1000 + 6 * 3600000), "1000"))

    def test_disable_without_hours_has_no_expiry(self):
        self.assertEqual(plan(self.c, "editor", "disable", "jns", "license", "", 5)[1][1][2], "")

    def test_enable_deletes_only_that_source(self):
        st = plan(self.c, "editor", "enable", "bbc", "", "", 1)
        self.assertEqual(st[1], (DELETE_SQL, ("bbc",)))

    def test_rejects_before_any_write(self):
        for args in [("monitor", "disable", "bbc", "x", ""),      # editor key on monitor
                     ("editor", "disable", "jns", "", ""),         # no reason
                     ("editor", "disable", "jns", "x", "0"),
                     ("editor", "disable", "jns", "x", "721"),
                     ("nope", "list", "", "", ""),
                     ("editor", "drop", "jns", "x", "")]:
            with self.assertRaises(ValueError, msg=args):
                plan(self.c, *args, 1)

    def test_schema_statement_is_create_if_not_exists(self):
        self.assertTrue(SCHEMA_SQL.startswith("CREATE TABLE IF NOT EXISTS source_controls"))
        self.assertNotIn(";", SCHEMA_SQL)


if __name__ == "__main__":
    unittest.main()
