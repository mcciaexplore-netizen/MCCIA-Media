'use client';

import { DG_ENGAGEMENT_TYPES, DgEngagementType, resolveDgEngagementType, resolveRecordDgEngagementType } from './dg-classification';
import { normalizeLanguage, peopleCategory, recordLookup, uniqueCoverage, yearCounts } from './media-metadata';

type RecordLike = {
  id?: string;
  year: number | null;
  date?: string;
  publisher: string;
  language: string;
  presence: string;
  topic: string;
  status: string;
  title?: string;
  description?: string;
  notes?: string;
  format?: string;
  dgEngagementType?: DgEngagementType | null;
  url?: string | null;
};

type ClippingLike = {
  id?: string;
  year: number | null;
  date?: string;
  publisher: string;
  language?: string;
  presence?: string;
  status?: string;
  matchedRecordId?: string | null;
  dgEngagementType?: DgEngagementType | null;
  ocrHeadline?: string | null;
  ocrExcerpt?: string | null;
  ocrText?: string | null;
  reviewDecision?: string | null;
};

type Props = {
  records: RecordLike[];
  clippings: ClippingLike[];
  sourceChecks: Record<string,{category:string;checkedAt:string}>;
  auditUpdatedAt: string;
};

function topCounts(values: string[], limit = 6) {
  const counts = values.filter(Boolean).reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, limit);
}

function Bars({ rows }: { rows: [string, number][] }) {
  const maximum = Math.max(1, ...rows.map(([, count]) => count));
  return <div className="analytics-bars">{rows.map(([label, count]) => <div key={label}>
    <span title={label}>{label}</span><i><b style={{ width: count ? `${Math.max(4, (count / maximum) * 100)}%` : '0%' }} /></i><strong>{count.toLocaleString('en-IN')}</strong>
  </div>)}</div>;
}

export default function AnalyticsPanel({ records, clippings, sourceChecks, auditUpdatedAt }: Props) {
  const allCoverage = uniqueCoverage(records, clippings);
  const years = yearCounts(allCoverage);
  const publishers = topCounts(allCoverage.map((item) => item.publisher), 7);
  const people = topCounts(allCoverage.map((item) => peopleCategory(item.presence)), 8);
  const languages = topCounts(allCoverage.map((item) => normalizeLanguage(item.language)), 8);
  const topics = topCounts(records.map((item) => item.topic), 6);
  const recordIds = new Set(recordLookup(records).keys());
  const uniqueClassifications = [
    ...records.map((item) => resolveRecordDgEngagementType(item)),
    ...clippings
      .filter((item) => !item.matchedRecordId || !recordIds.has(item.matchedRecordId))
      .map((item) => resolveDgEngagementType(item.dgEngagementType, `${item.ocrHeadline || ''} ${item.ocrExcerpt || ''} ${item.ocrText || ''} ${item.presence || ''} ${item.reviewDecision || ''}`)),
  ];
  const classifications = DG_ENGAGEMENT_TYPES.map((classification) => [
    classification,
    uniqueClassifications.filter((value) => value === classification).length,
  ] as [string, number]);
  const discoveries = records.filter(item=>item.id?.startsWith('GN-')||item.id?.startsWith('SRC-')).length;
  const broken = Object.values(sourceChecks).filter(item=>item.category==='unreachable').length;

  return <section className="analytics-panel" aria-labelledby="analytics-title">
    <div className="analytics-heading"><div><p className="kicker">LIVE COVERAGE INTELLIGENCE</p><h2 id="analytics-title">Media analytics</h2></div><p>Connected clippings count with their article once. Unconnected clippings count separately. Missing dates, languages and people remain labelled for review.</p></div>
    <div className="analytics-kpis">
      <span><strong>{allCoverage.length.toLocaleString('en-IN')}</strong>Unique coverage items</span>
      <span><strong>{discoveries.toLocaleString('en-IN')}</strong>Automated discoveries</span>
      <span><strong>{broken.toLocaleString('en-IN')}</strong>Archive URLs last recorded unreachable</span>
    </div>
<p className="audit-freshness">Stored source audit refreshed {new Date(auditUpdatedAt).toLocaleDateString('en-IN')}. Individual checks may be older; this is not a fresh live availability test.</p>
    <div className="analytics-grid">
      <article><h3>Coverage by year</h3><Bars rows={years} /></article>
      <article><h3>Leading publishers</h3><Bars rows={publishers} /></article>
      <article><h3>People / organisations</h3><Bars rows={people} /></article>
      <article><h3>Languages</h3><Bars rows={languages} /></article>
      <article><h3>Topics</h3><Bars rows={topics} /></article>
      <article><h3>DG content classification</h3><Bars rows={classifications} /></article>
    </div>
  </section>;
}
