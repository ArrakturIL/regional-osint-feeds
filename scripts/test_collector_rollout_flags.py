"""Regression gates for source-by-source GitHub JSON writeback retirement."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scripts.collector_rollout_flags import selected_sources, source_enabled

ROOT = Path(__file__).resolve().parents[1]


class TestCanaryPromotion(unittest.TestCase):
    def test_config_enables_only_explicitly_approved_source(self):
        selected = selected_sources(ROOT / 'config/collector-rollout.json')
        self.assertEqual(selected, {'gdelt'})
        self.assertTrue(source_enabled('gdelt', selected))
        self.assertFalse(source_enabled('centcom', selected))
        self.assertFalse(source_enabled('news_translation', selected))

    def test_rejects_unrecognized_source_and_duplicate_entries(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'policy.json'
            for entries in [['gdelt', 'gdelt'], ['../secret'], ['all'], ['gdelt', 12]]:
                path.write_text(json.dumps({'schema_version': 1, 'stage': 'canary', 'sources': entries}), encoding='utf8')
                with self.subTest(entries=entries), self.assertRaises((ValueError, TypeError)):
                    selected_sources(path)

    def test_unknown_source_fails_closed_even_when_approved_list_exists(self):
        with self.assertRaises(ValueError):
            source_enabled('../other', {'gdelt'})

    def test_gdelt_workflow_keeps_fallback_but_skips_git_commit_after_d1_success(self):
        body = (ROOT / '.github/workflows/gdelt.yml').read_text(encoding='utf8')
        self.assertIn('id: rollout', body)
        self.assertIn('python -m scripts.collector_rollout_flags --source gdelt', body)
        self.assertIn("steps.rollout.outputs.enabled == 'true'", body)
        self.assertIn("steps.neon_d1.outcome == 'success'", body)
        self.assertIn('git push', body, 'Old GitHub fallback must remain while cutover is reversible')
        self.assertLess(body.index('id: rollout'), body.index('id: neon_d1'))


if __name__ == '__main__':
    unittest.main()
