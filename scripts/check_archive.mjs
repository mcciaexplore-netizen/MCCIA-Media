import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, publicationYear, validPublicationDate } from '../app/media-metadata.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasets = ['records', 'clippings', 'google-news-alerts', 'epaper-sources'];
const errors = [];
const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''))&&validPublicationDate(value+'-01');
const records = JSON.parse(fs.readFileSync(path.join(root, 'app/records.json'), 'utf8'));
const recordIds = new Set(records.map(record => record.id));
const aliasIds = new Set(records.flatMap(record => record.mergedRecordIds ?? []));
const norm = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const evidenceDates = new Set(records.filter(row => row.evidenceImages?.length).map(row => `${norm(row.publisher)}|${norm(row.title)}|${row.date}`));
for (const name of datasets) {
  const rows = JSON.parse(fs.readFileSync(path.join(root, `app/${name}.json`), 'utf8'));
  const ids = new Set();
  for (const row of rows) {
    const error = message => errors.push(`${name}/${row.id}: ${message}`);
    if (!row.id || ids.has(row.id)) error('Missing or duplicate ID');
    ids.add(row.id);
    if (name === 'records' && aliasIds.has(row.id)) error('Previously merged duplicate has reappeared');
    if (name === 'records' && row.date && !row.evidenceImages?.length) {
      const [year, month, day] = row.date.split('-');
      if (month !== day && Number(day) <= 12 && evidenceDates.has(`${norm(row.publisher)}|${norm(row.title)}|${year}-${day}-${month}`)) error('Possible day/month reversal against an evidence-backed article; review before publishing');
    }
    if(row.datePrecision==='month'&&(!validMonth(row.publicationMonth)||row.date||row.year!==Number(row.publicationMonth.slice(0,4))))error('Month-only publication must retain month precision without an invented day');
    if (row.date && !validPublicationDate(row.date)) error(`Invalid or future publication date: ${row.date}`);
    if (row.year !== publicationYear(row)) error(`Year disagrees with date or missing-year convention: ${row.year}`);
    if (!LANGUAGES.includes(row.language)) error(`Invalid language: ${row.language}`);
    if (name === 'clippings' && !row.presence) error('Missing people metadata');
    if (name === 'clippings' && row.matchedRecordId && !recordIds.has(row.matchedRecordId)) error('Broken connected-record reference');
    if (row.url && !/^https?:\/\/\S+$/i.test(row.url)) error('Source URL is not an HTTP(S) URL');
    if (name === 'records' && ['PDF', 'Webpage'].includes(row.language)) error('Shifted CSV columns');
  }
}
if (errors.length) {
  console.error(`Archive validation failed (${errors.length}):\n${errors.join('\n')}`);
  process.exitCode = 1;
} else console.log('Archive validation passed: dates, years, languages, IDs, URLs and clipping references.');
