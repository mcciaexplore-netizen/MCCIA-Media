'use client';

type RecordLike = {
  year: number;
  publisher: string;
  language: string;
  presence: string;
  topic: string;
  status: string;
  url?: string | null;
};

type ClippingLike = {
  year: number;
  publisher: string;
  language?: string;
  presence?: string;
  status?: string;
};

type IntakeLike = {
  status: string;
  duplicateScore?: number | null;
  linkStatus?: string | null;
};

type Props = {
  records: RecordLike[];
  monitoredSources: RecordLike[];
  clippings: ClippingLike[];
  intake: IntakeLike[];
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
    <span title={label}>{label}</span><i><b style={{ width: `${Math.max(4, (count / maximum) * 100)}%` }} /></i><strong>{count.toLocaleString('en-IN')}</strong>
  </div>)}</div>;
}

export default function AnalyticsPanel({ records, monitoredSources, clippings, intake }: Props) {
  const allCoverage = [...records, ...clippings];
  const years = topCounts(allCoverage.map((item) => String(item.year)).filter((year) => year !== '0'), 12).sort((left, right) => Number(left[0]) - Number(right[0]));
  const publishers = topCounts(allCoverage.map((item) => item.publisher), 7);
  const people = topCounts([...records.map((item) => item.presence), ...clippings.map((item) => item.presence || 'Unknown')], 6);
  const languages = topCounts([...records.map((item) => item.language), ...clippings.map((item) => item.language || 'Unknown')], 6);
  const topics = topCounts(records.map((item) => item.topic), 6);
  const approved = intake.filter((item) => item.status === 'Approved').length;
  const pending = intake.filter((item) => item.status === 'Pending OCR' || item.status === 'In review').length;
  const duplicates = intake.filter((item) => Number(item.duplicateScore) >= 0.72).length;
  const broken = intake.filter((item) => item.linkStatus === 'Broken').length;

  return <section className="analytics-panel" aria-labelledby="analytics-title">
    <div className="analytics-heading"><div><p className="kicker">LIVE COVERAGE INTELLIGENCE</p><h2 id="analytics-title">Media analytics</h2></div><p>People, organisations, languages, topics, editorial progress and monitored-source health update as new evidence enters the workflow.</p></div>
    <div className="analytics-kpis">
      <span><strong>{allCoverage.length.toLocaleString('en-IN')}</strong>Indexed records</span>
      <span><strong>{monitoredSources.length.toLocaleString('en-IN')}</strong>Automated leads</span>
      <span><strong>{pending.toLocaleString('en-IN')}</strong>Awaiting review</span>
      <span><strong>{approved.toLocaleString('en-IN')}</strong>Approved intake</span>
      <span><strong>{duplicates.toLocaleString('en-IN')}</strong>Duplicate alerts</span>
      <span><strong>{broken.toLocaleString('en-IN')}</strong>Broken links</span>
    </div>
    <div className="analytics-grid">
      <article><h3>Coverage by year</h3><Bars rows={years} /></article>
      <article><h3>Leading publishers</h3><Bars rows={publishers} /></article>
      <article><h3>People / organisations</h3><Bars rows={people} /></article>
      <article><h3>Languages</h3><Bars rows={languages} /></article>
      <article><h3>Topics</h3><Bars rows={topics} /></article>
      <article className="analytics-workflow"><h3>Editorial workflow</h3><div><span><b className="pending" />Pending / review<strong>{pending}</strong></span><span><b className="approved" />Approved<strong>{approved}</strong></span><span><b className="rejected" />Rejected<strong>{intake.filter((item) => item.status === 'Rejected').length}</strong></span></div></article>
    </div>
  </section>;
}
