import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indiaToday, normalizeLanguage, publicationYear, resolveClippingMetadata, validPublicationDate } from '../app/media-metadata.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
const records = read('app/records.json');
const clippings = read('app/clippings.json');
const historyPath = 'archive-repair-history.json';
const history = fs.existsSync(path.join(root, historyPath)) ? read(historyPath) : [];
const lookup = new Map(records.map(record => [record.id, record]));
const aliases = new Map();

// Reviewed pairs only. Never reverse a whole dataset based on its date format.
const corrections = [
  ['PG0001', 'PG0027', '2026-12-07', '2026-07-12'],
  ['PG0002', 'PG0046', '2026-11-05', '2026-05-11'],
  ['PG0003', 'PG0054', '2026-09-05', '2026-05-09'],
  ['PG0004', 'PG0057', '2026-09-05', '2026-05-09'],
  ['PG0005', 'PG0061', '2026-09-05', '2026-05-09'],
  ['PG0006', 'PG0054', '2026-09-05', '2026-05-09'],
  ['PG0007', 'PG0056', '2026-09-05', '2026-05-09'],
  ['PG0008', 'PG0062', '2026-09-05', '2026-05-09'],
  ['PG0014', 'PG0034', '2026-08-06', '2026-06-08'],
  ['PG0028', 'PG0037', '2026-07-06', '2026-06-07'],
  ['PG0009', 'PG2771', '2026-08-15', '2026-08-15'],
];

for (const [oldId, targetId, oldDate, date] of corrections) {
  const original = lookup.get(oldId);
  const target = lookup.get(targetId);
  if (!original) continue; // An already applied migration is a no-op.
  const evidence = target?.evidenceImages?.filter(image => image.date === date);
  if (original.date !== oldDate || target?.date !== date || original.publisher !== target.publisher || !evidence?.length) {
    throw new Error(`Correction ${oldId} no longer matches its reviewed evidence. Review manually.`);
  }
  const headlineRepair = oldId === 'PG0009';
  history.push({ kind: headlineRepair ? 'headline review and duplicate merge' : 'date correction and duplicate merge', original: structuredClone(original), retainedRecordId: targetId, correctedDate: date, evidence: evidence.map(image => image.originalFilename), reason: headlineRepair ? 'Headline visually checked against CLIP-6401D1B742D9 preview: same Sakal story and publication date. Full OCR has not been reviewed.' : 'Day/month reversal; matching publisher and headline (including transliterated headlines) in dated clipping evidence.' });
  if (headlineRepair) {
    target.originalOcrTitle = target.title;
    target.title = original.title;
    target.headlineReviewStatus = 'Headline checked against clipping preview; full OCR unreviewed';
  }
  aliases.set(oldId, targetId);
  target.mergedRecordIds = [...new Set([...(target.mergedRecordIds ?? []), oldId])];
  target.sourceDataset = [...new Set(`${target.sourceDataset}; ${original.sourceDataset}`.split(';').map(value => value.trim()).filter(Boolean))].join('; ');
  target.duplicateCount = Number(target.duplicateCount || 1) + Number(original.duplicateCount || 1);
  target.dateSource = evidence.map(image => image.originalFilename).join('; ');
  if ((original.description?.length ?? 0) > (target.description?.length ?? 0) && original.presence === 'DG quote recorded') target.description = original.description;
  target.mergeNotes = `${target.mergeNotes || ''}; ${oldId} merged after ${headlineRepair ? 'headline comparison against clipping preview' : 'publication date correction'}`.replace(/^; /, '');
}

const retained = records.filter(record => !aliases.has(record.id));
for (const record of retained) {
  if (['PDF', 'Webpage'].includes(record.language)) {
    if (!/^https?:\/\//.test(record.title) || /^https?:\/\//.test(record.url || '')) throw new Error(`Unexpected shifted fields in ${record.id}`);
    history.push({ kind: 'shifted CSV columns', original: structuredClone(record), reason: 'Title contained URL; URL contained description; language contained media format. Publication date is unconfirmed.' });
    Object.assign(record, { title: record.format, format: record.language, type: record.language === 'PDF' ? 'PDF' : 'Other', url: record.title, description: record.url, language: 'Language not recorded', date: '', year: null, status: 'Unverified', dateReviewStatus: 'Publication date requires source review' });
    record.notes += ' Misaligned CSV columns repaired; publication date and language require source review.';
  }
  const year = publicationYear(record);
  if (record.year !== year) history.push({ kind: 'year normalization', id: record.id, previousYear: record.year, year, date: record.date, reason: record.date ? 'Year derived from publication date, not archive folder.' : 'Missing year normalized to null.' });
  record.year = year;
  record.language = normalizeLanguage(record.language);
  if (record.url && !/^https?:\/\/\S+$/i.test(record.url)) {
    history.push({ kind: 'invalid source URL', id: record.id, originalUrl: record.url, reason: 'Retained for editorial review; not a valid clickable source.' });
    record.sourceUrlForReview = record.url;
    record.url = null;
  }
  if (record.relatedRecordId && aliases.has(record.relatedRecordId)) record.relatedRecordId = aliases.get(record.relatedRecordId);
}
const retainedLookup = new Map(retained.map(record => [record.id, record]));
for (const item of clippings) {
  if (aliases.has(item.matchedRecordId)) item.matchedRecordId = aliases.get(item.matchedRecordId);
  if (item.candidateRecordIds) item.candidateRecordIds = [...new Set(item.candidateRecordIds.map(id => aliases.get(id) ?? id))];
  const previousYear = item.year;
  const linked = retainedLookup.get(item.matchedRecordId);
  const resolved = resolveClippingMetadata(item, linked);
  Object.assign(item, resolved);
  if (previousYear !== item.year) history.push({ kind: 'clipping year normalization', id: item.id, previousYear, year: item.year, date: item.date, reason: 'Year derived from publication date, not archive folder.' });
  item.metadataSource = linked ? `Connected record ${linked.id}; unresolved fields require review` : 'Clipping metadata; unresolved fields require review';
}

const failures = [...retained, ...clippings].filter(item => item.date && !validPublicationDate(item.date, indiaToday()));
if (failures.length) throw new Error(`Invalid/future dates still need review: ${failures.map(item => item.id).join(', ')}`);

if (process.argv.includes('--apply')) {
  write('app/records.json', retained);
  write('app/clippings.json', clippings);
  write(historyPath, history);
  for (const name of ['google-news-alerts', 'epaper-sources']) {
    const rows = read(`app/${name}.json`);
    const normalized = rows.map(row => ({ ...row, year: publicationYear(row), language: normalizeLanguage(row.language) }));
    if (JSON.stringify(rows) !== JSON.stringify(normalized)) write(`app/${name}.json`, normalized);
  }
  const report = read('comparison_report.json');
  report.final_records = retained.length;
  report.date_quality_repairs = { mergedRecordIds: history.filter(item => item.kind === 'date correction and duplicate merge').map(item => item.original.id), history: historyPath };
  write('comparison_report.json', report);
  console.log(`Saved ${retained.length} records and ${clippings.length} clippings. Original values preserved in ${historyPath}.`);
} else {
  console.log(`Preview: ${aliases.size} reviewed duplicate merges, ${history.length} audit entries. Run with --apply to save.`);
}
