import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_dates import assign_missing_ids, publication_date, publication_year


class ImportDateTests(unittest.TestCase):
    def test_day_first(self):
        self.assertEqual(publication_date('12/07/2020'), '2020-07-12')
        self.assertEqual(publication_date('११.०५.२०२०'), '2020-05-11')
        self.assertEqual(publication_date('2020-07-12 00:00:00'), '2020-07-12')

    def test_invalid_and_future(self):
        for value in ['31/02/2020', '2020-13-01', (date.today() + timedelta(days=2)).isoformat()]:
            with self.assertRaises(ValueError):
                publication_date(value)

    def test_partial_is_not_fabricated(self):
        self.assertEqual(publication_date('2020-07'), '')
        self.assertEqual(publication_date('2020'), '')
        self.assertEqual(publication_year(2021, '2020-07-12'), 2020)
        self.assertIsNone(publication_year('2018-2026'))

    def test_stable_ids(self):
        records = [{'id': 'PG0293'}, {'id': ''}, {'id': 'PG0001'}]
        assign_missing_ids(records)
        self.assertEqual([r['id'] for r in records], ['PG0293', 'PG0294', 'PG0001'])


if __name__ == '__main__':
    unittest.main()
