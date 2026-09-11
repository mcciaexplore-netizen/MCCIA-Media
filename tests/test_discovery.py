import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from argparse import Namespace

spec = importlib.util.spec_from_file_location('discovery', Path(__file__).parents[1] / 'scripts/fetch_google_news.py')
discovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(discovery)

class DiscoveryTest(unittest.TestCase):
    def test_marathi_suffix_and_bilingual_editions(self):
        self.assertTrue(discovery.relevant_headline('एमसीसीआयएच्या हेल्पलाइनचा विस्तार'))
        self.assertIn('ceid=IN%3Aen', discovery.feed_url('MCCIA अध्यक्ष', 10, 'en'))
        self.assertIn('ceid=IN%3Amr', discovery.feed_url('MCCIA अध्यक्ष', 10, 'mr'))
        self.assertEqual({w['language'] for w in discovery.WATCHES}, {'en', 'mr'})

    def test_daily_run_preserves_curated_articles(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'app').mkdir();output=root/'app/google-news-alerts.json'
            original={'id':'GN-CURATED','title':'Industry summit opens today','status':'Partially verified'}
            output.write_text(json.dumps([original]))
            with patch.object(discovery,'ROOT',root),patch.object(discovery,'OUTPUT_PATH',output),patch.object(discovery,'parse_args',return_value=Namespace(days=10,max_per_query=50,dry_run=False)),patch.object(discovery,'WATCHES',[{'label':'A'}]),patch.object(discovery,'fetch_watch',return_value=[]):
                self.assertEqual(discovery.main(),0)
            self.assertEqual(json.loads(output.read_text()),[original])

    def test_relevance_uses_headline_not_query_or_generic_industry_terms(self):
        for title in ['MCCIA launches MSME helpline', 'Prashant Girbane on exports', 'प्रशांत गिरबणे यांचे मार्गदर्शन']:
            self.assertTrue(discovery.relevant_headline(title))
        for title in ['Homeless man steals seven seized pistols', 'Pune MSMEs get support', 'NotMCCIA headline']:
            self.assertFalse(discovery.relevant_headline(title))

    def test_first_seen_is_stable_and_partial_failure_is_recorded(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'app').mkdir()
            output = root / 'app/google-news-alerts.json'
            original = {'id': 'GN-1', 'title': 'MCCIA news', 'date': '2026-08-01', 'firstSeenAt': '2026-09-01T10:00:00Z'}
            output.write_text(json.dumps([original]))
            updated = {**original, 'firstSeenAt': '2026-09-10T10:00:00Z'}
            with patch.object(discovery, 'ROOT', root), patch.object(discovery, 'OUTPUT_PATH', output), patch.object(discovery, 'parse_args', return_value=Namespace(days=10, max_per_query=50, dry_run=False)), patch.object(discovery, 'WATCHES', [{'label': 'A'}, {'label': 'B'}]), patch.object(discovery, 'fetch_watch', side_effect=[[updated], RuntimeError('offline')]):
                self.assertEqual(discovery.main(), 0)
            self.assertEqual(json.loads(output.read_text())[0]['firstSeenAt'], original['firstSeenAt'])
            status = json.loads((root / 'app/discovery-status.json').read_text())
            self.assertEqual(status['state'], 'partial')
            self.assertEqual(status['failedWatches'], 1)
            self.assertEqual(status['newItems'], 0)

    def test_same_source_url_does_not_create_another_id(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'app').mkdir();output=root/'app/google-news-alerts.json'
            original={'id':'GN-OLD','title':'MCCIA news','url':'https://example.test/story','date':'2026-09-01'}
            output.write_text(json.dumps([original]))
            changed={**original,'id':'GN-NEW','publisher':'New publisher spelling','date':'2026-09-02'}
            with patch.object(discovery,'ROOT',root),patch.object(discovery,'OUTPUT_PATH',output),patch.object(discovery,'parse_args',return_value=Namespace(days=10,max_per_query=50,dry_run=False)),patch.object(discovery,'WATCHES',[{'label':'A'}]),patch.object(discovery,'fetch_watch',return_value=[changed]):
                self.assertEqual(discovery.main(),0)
            self.assertEqual(len(json.loads(output.read_text())),1)

    def test_all_watches_failing_does_not_overwrite_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'alerts.json'
            output.write_text('[]')
            with patch.object(discovery, 'OUTPUT_PATH', output), patch.object(discovery, 'parse_args', return_value=Namespace(days=10, max_per_query=50, dry_run=False)), patch.object(discovery, 'WATCHES', [{'label': 'A'}]), patch.object(discovery, 'fetch_watch', side_effect=RuntimeError('offline')):
                self.assertEqual(discovery.main(), 1)
            self.assertEqual(output.read_text(), '[]')

if __name__ == '__main__':
    unittest.main()
