import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calendarDate, comparePublicationDates, indiaToday, normalizeLanguage, peopleCategory, publicationYear, recordLookup, resolveClippingMetadata, uniqueCoverage, validPublicationDate, yearCounts } from '../app/media-metadata.ts';

test('publication dates reject impossible days, future dates, ambiguous formats and trailing data', () => {
  for (const value of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-12-07', '12/07/2026', '2026-07-12 extra']) assert.equal(validPublicationDate(value, '2026-09-10'), null);
  assert.equal(validPublicationDate('2026-07-12', '2026-09-10'), '2026-07-12');
  assert.equal(calendarDate('2024-02-29'), '2024-02-29');
  assert.equal(indiaToday(new Date('2026-09-09T19:00:00Z')), '2026-09-10');
});

test('missing years share a visible bucket and publication date overrides folder year', () => {
  const rows = [{ year: null }, { year: 0 }, {}, { date: '2025-02-11', year: 2026 }, { year: 2024 }];
  assert.deepEqual(yearCounts(rows, '2026-09-10'), [['2024', 1], ['2025', 1], ['Year not recorded', 3]]);
  assert.equal(publicationYear({ date: '2026-12-07', year: 2026 }, '2026-09-10'), null);
});

test('clippings inherit metadata, preserve explicit values, and tolerate missing links', () => {
  const article = { id: 'R1', language: 'Marathi', presence: 'DG' };
  assert.deepEqual(resolveClippingMetadata({ id: 'C1', matchedRecordId: 'R1' }, article), { id: 'C1', matchedRecordId: 'R1', year: null, language: 'Marathi', presence: 'DG' });
  assert.equal(resolveClippingMetadata({ language: 'Hindi' }, article).language, 'Hindi');
  assert.equal(resolveClippingMetadata({ language: 'Unknown' }, article).language, 'Marathi');
  assert.equal(resolveClippingMetadata({}).presence, 'Person not recorded');
});

test('count an article and its connected scans only once, including historical aliases', () => {
  const records = [{ id: 'R1', mergedRecordIds: ['OLD'], language: 'Marathi' }];
  const clippings = [{ id: 'C1', matchedRecordId: 'R1' }, { id: 'C2', matchedRecordId: 'OLD' }, { id: 'C3', matchedRecordId: 'missing' }, { id: 'C4' }];
  assert.equal(recordLookup(records).get('OLD'), records[0]);
  assert.deepEqual(uniqueCoverage(records, clippings).map(row => row.id), ['R1', 'C3', 'C4']);
});

test('languages are actual language labels; uncertain people are not asserted as DG', () => {
  assert.equal(normalizeLanguage('PDF'), 'Language not recorded');
  assert.equal(normalizeLanguage('Webpage'), 'Language not recorded');
  assert.equal(normalizeLanguage('mr'), 'Marathi');
  assert.equal(normalizeLanguage('English / Marathi'), 'English / Marathi');
  assert.equal(peopleCategory('DG'), 'Director General / Prashant Girbane');
  assert.equal(peopleCategory('Both'), 'DG and MCCIA President');
  assert.equal(peopleCategory('Presidant'), 'MCCIA President');
  assert.equal(peopleCategory('MCCIA publication; DG occurrence not yet checked'), 'MCCIA / person not specified');
  assert.equal(peopleCategory('Named / occurrence reported'), 'Person not recorded');
});

test('undated records sort last in both date directions', () => {
  assert.ok(comparePublicationDates('', '2020-01-01', true) > 0);
  assert.ok(comparePublicationDates('', '2020-01-01', false) > 0);
  assert.ok(comparePublicationDates('2020-01-01', '2021-01-01', true) < 0);
});

test('reviewed repairs preserve evidence, aliases and the original source values', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const records = read('app/records.json');
  const clippings = read('app/clippings.json');
  const history = read('archive-repair-history.json');
  const lookup = recordLookup(records);
  assert.equal(lookup.get('PG0001').id, 'PG0027');
  assert.equal(lookup.get('PG0001').date, '2026-07-12');
  assert.equal(lookup.get('PG0002').date, '2026-05-11');
  const merges = history.filter(item => item.kind === 'date correction and duplicate merge');
  assert.ok(merges.length >= 10);
  for (const item of merges) {
    const retained = lookup.get(item.retainedRecordId);
    assert.equal(retained.date, item.correctedDate);
    assert.ok(retained.evidenceImages.some(image => item.evidence.includes(image.originalFilename)));
    assert.ok(retained.mergedRecordIds.includes(item.original.id));
  }
  assert.ok(clippings.length >= 1488);
  assert.equal(new Set(clippings.map(item => item.sha256)).size, clippings.length);
  assert.ok(clippings.every(item => item.language && item.presence));
  for (const id of ['PG0131', 'PG0132', 'PG0505']) {
    assert.match(lookup.get(id).url, /^https:\/\//);
    assert.equal(lookup.get(id).date, '');
    assert.equal(lookup.get(id).language, 'Language not recorded');
  }
});
