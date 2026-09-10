import {detectMediaMetadata} from './automatic-metadata.js';
/** Shared rules for archive display, incoming metadata and data validation. */
export const LANGUAGE_NOT_RECORDED = 'Language not recorded';
export const PERSON_NOT_RECORDED = 'Person not recorded';
export const YEAR_NOT_RECORDED = 'Year not recorded';
export const LANGUAGES = ['English', 'Marathi', 'Hindi', 'Marathi / Hindi', 'English / Marathi', 'Marathi / Hindi / English', 'Multilingual', 'Other', LANGUAGE_NOT_RECORDED] as const;

export function indiaToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function calendarDate(value: unknown): string | null {
  const candidate = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function validPublicationDate(value: unknown, today = indiaToday()) {
  const candidate = calendarDate(value);
  return candidate && candidate <= today ? candidate : null;
}

export function publicationYear(item: { date?: unknown; year?: unknown }, today = indiaToday()): number | null {
  // A supplied but invalid date must not silently become a confident year.
  if (item.date) {
    const date = validPublicationDate(item.date, today);
    return date ? Number(date.slice(0, 4)) : null;
  }
  const year = Number(item.year);
  return Number.isInteger(year) && year >= 1900 && year <= Number(today.slice(0, 4)) ? year : null;
}

export function prettyDate(value: unknown) {
  if (!value) return 'Date not recorded';
  const date = validPublicationDate(value);
  if (!date) return 'Date needs review';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function comparePublicationDates(a: string, b: string, oldest = false) {
  const left = validPublicationDate(a), right = validPublicationDate(b);
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  return oldest ? left.localeCompare(right) : right.localeCompare(left);
}

export function normalizeRecordMetadata<T extends CoverageMetadata>(item: T): T {
  const evidence = [item.title, item.ocrHeadline, item.ocrText || item.ocrExcerpt, item.description].filter(Boolean).join(' ');
  const inferred = detectMediaMetadata(evidence);
  const languageEvidence = item.ocrText || item.ocrExcerpt || item.title || item.ocrHeadline || '';
  const language = normalizeLanguage(item.language);
  return { ...item, year: publicationYear(item), language: language === LANGUAGE_NOT_RECORDED ? detectMediaMetadata(languageEvidence).language : language,
    presence: !item.presence || /^(unknown|person not recorded|mccia|mccia news)$/i.test(item.presence) ? (inferred.presence === PERSON_NOT_RECORDED ? item.presence || PERSON_NOT_RECORDED : inferred.presence) : item.presence,
    topic: !item.topic || /^(topic not assigned|mccia coverage|mccia media monitoring)$/i.test(item.topic) ? inferred.topic : item.topic,
    dgEngagementType: item.dgEngagementType || inferred.dgEngagementType,
  };
}

export function normalizeLanguage(value: unknown): string {
  const candidate = String(value ?? '').trim();
  const aliases: Record<string, string> = { en: 'English', eng: 'English', mr: 'Marathi', mar: 'Marathi', hi: 'Hindi', hin: 'Hindi' };
  return aliases[candidate.toLowerCase()] ?? LANGUAGES.find(language => language.toLowerCase() === candidate.toLowerCase()) ?? LANGUAGE_NOT_RECORDED;
}

export type CoverageMetadata = {
  title?: string; description?: string; ocrHeadline?: string | null; ocrText?: string | null; ocrExcerpt?: string | null; topic?: string; dgEngagementType?: string | null;
  id?: string;
  date?: string;
  year?: number | null;
  language?: string;
  presence?: string;
  matchedRecordId?: string | null;
  mergedRecordIds?: string[];
  metadataSource?: string;
};

export function recordLookup<T extends CoverageMetadata>(records: T[]) {
  const result = new Map<string, T>();
  for (const record of records) {
    if (record.id) result.set(record.id, record);
    for (const id of record.mergedRecordIds ?? []) result.set(id, record);
  }
  return result;
}

export function resolveClippingMetadata<T extends CoverageMetadata>(item: T, record?: CoverageMetadata): T {
  if (record && item.metadataSource?.startsWith('Connected record ')) return { ...item, year: publicationYear(item), language: normalizeLanguage(record.language), presence: record.presence || PERSON_NOT_RECORDED };
  const ownLanguage = normalizeLanguage(item.language);
  const presence = item.presence && !/^(unknown|person not recorded)$/i.test(item.presence) ? item.presence : record?.presence;
  return { ...item, year: publicationYear(item), language: ownLanguage === LANGUAGE_NOT_RECORDED ? normalizeLanguage(record?.language) : ownLanguage, presence: presence || PERSON_NOT_RECORDED };
}

export function uniqueCoverage<R extends CoverageMetadata, C extends CoverageMetadata>(records: R[], clippings: C[]) {
  const lookup = recordLookup(records);
  return [...records, ...clippings.filter(item => !item.matchedRecordId || !lookup.has(item.matchedRecordId))];
}

export function yearCounts(items: CoverageMetadata[], today = indiaToday()): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const year = publicationYear(item, today);
    const label = year === null ? YEAR_NOT_RECORDED : String(year);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a === YEAR_NOT_RECORDED ? 1 : b === YEAR_NOT_RECORDED ? -1 : Number(a) - Number(b));
}

export function peopleCategory(presence: unknown) {
  const value = String(presence ?? '').trim().toLowerCase();
  const unresolved = /not yet checked|requires.*review|relevance reported|occurrence reported/.test(value);
  const dg = !unresolved && (/\bdg\b|prashan[tr] girbane|director general|प्रशांत गिरब/.test(value));
  const president = !unresolved && /presid[ae]nt|sanjay kirloskar/.test(value);
  if (/^both\b/.test(value) || (dg && president)) return 'DG and MCCIA President';
  if (dg) return 'Director General / Prashant Girbane';
  if (president) return 'MCCIA President';
  if (/mccia/.test(value)) return 'MCCIA / person not specified';
  if (value === 'kopardekar') return 'Sudhanwa Kopardekar';
  return PERSON_NOT_RECORDED;
}
