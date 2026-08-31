'use client';

import { useEffect, useMemo, useState } from 'react';
import { DG_ENGAGEMENT_TYPES, DgEngagementType, resolveRecordDgEngagementType } from './dg-classification';

export type IntakeRecord = {
  id: string;
  sha256: string;
  receivedAt: string;
  formTimestamp?: string | null;
  formResponseId?: string | null;
  driveFileId?: string | null;
  driveFileUrl?: string | null;
  driveFolderUrl?: string | null;
  sheetRow?: number | null;
  submitterEmail?: string | null;
  originalFilename: string;
  imageUrl: string;
  evidenceUrl?: string;
  isImage?: boolean;
  originalContentType: string;
  originalSize: number;
  publicationDate: string;
  year: number;
  publisher: string;
  page?: string | null;
  language: string;
  headline: string;
  presence: string;
  dgEngagementType?: DgEngagementType | null;
  notes: string;
  sourceUrl?: string | null;
  status: 'Pending OCR' | 'In review' | 'Approved' | 'Rejected';
  errorMessage?: string | null;
  approvedAt?: string | null;
  approvedRecordId?: string | null;
  editionCity?: string | null;
  mediaType?: string | null;
  ocrText?: string | null;
  ocrConfidence?: number | null;
  ocrEngine?: string | null;
  duplicateScore?: number | null;
  duplicateRecordId?: string | null;
  duplicateReasons?: string | null;
  linkStatus?: string | null;
  linkHttpStatus?: number | null;
  verificationStatus?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

type AuditEvent = {
  id: string;
  createdAt: string;
  recordId?: string | null;
  action: string;
  actor: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  details?: string | null;
  source: string;
};

type Props = {
  records: IntakeRecord[];
  loading: boolean;
  loadError: string;
  onReview: (record: IntakeRecord) => void;
  onRecordChange: (record: IntakeRecord) => void;
  onReload: () => void;
};

const options = (values: string[]) => [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
const intakeDgClassification = (record: IntakeRecord) => resolveRecordDgEngagementType({
  dgEngagementType: record.dgEngagementType,
  title: record.headline,
  description: record.ocrText,
  presence: record.presence,
  notes: record.notes,
  publisher: record.publisher,
  format: record.mediaType,
});

function prettyDate(value: string) {
  if (!value) return 'Date not recorded';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function downloadCsv(records: IntakeRecord[]) {
  const columns = ['Inbox ID', 'Status', 'Received', 'Publication date', 'Publisher', 'Headline', 'Page', 'Language', 'People / organisation', 'DG content classification', 'Submitter', 'Drive file', 'Source URL', 'Approved record', 'Error'];
  const rows = records.map((record) => [record.id, record.status, record.receivedAt, record.publicationDate, record.publisher, record.headline, record.page, record.language, record.presence, intakeDgClassification(record), record.submitterEmail, record.driveFileUrl, record.sourceUrl, record.approvedRecordId, record.errorMessage]);
  const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'mccia-submission-inbox.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function IntakeInbox({ records, loading, loadError, onReview, onRecordChange, onReload }: Props) {
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('All');
  const [publisher, setPublisher] = useState('All');
  const [presence, setPresence] = useState('All');
  const [dgEngagementType, setDgEngagementType] = useState('All');
  const [status, setStatus] = useState('All');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    fetch('/api/form-intake/config')
      .then(async (response) => response.ok ? await response.json() as { formUrl?: string } : { formUrl: '' })
      .then((payload) => setFormUrl(payload.formUrl || ''))
      .catch(() => setFormUrl(''));
  }, []);
  useEffect(() => {
    fetch('/api/audit-log', { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as { events?: AuditEvent[] } : { events: [] })
      .then((payload) => setAuditEvents(Array.isArray(payload.events) ? payload.events : []))
      .catch(() => setAuditEvents([]));
  }, [records]);

  const years = options(records.map((record) => String(record.year)).filter((value) => value !== '0')).sort((left, right) => Number(right) - Number(left));
  const publishers = options(records.map((record) => record.publisher));
  const presences = options(records.map((record) => record.presence));
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records
      .filter((record) => year === 'All' || String(record.year) === year)
      .filter((record) => publisher === 'All' || record.publisher === publisher)
      .filter((record) => presence === 'All' || record.presence === presence)
      .filter((record) => dgEngagementType === 'All' || intakeDgClassification(record) === dgEngagementType)
      .filter((record) => status === 'All' || record.status === status)
      .filter((record) => !term || `${record.id} ${record.publisher} ${record.headline} ${record.presence} ${intakeDgClassification(record) || ''} ${record.language} ${record.notes} ${record.originalFilename} ${record.submitterEmail || ''}`.toLowerCase().includes(term));
  }, [records, search, year, publisher, presence, dgEngagementType, status]);

  const active = [search, year, publisher, presence, dgEngagementType, status].filter((value, index) => index === 0 ? Boolean(value) : value !== 'All').length;
  const clear = () => {
    setSearch('');
    setYear('All');
    setPublisher('All');
    setPresence('All');
    setDgEngagementType('All');
    setStatus('All');
  };

  const patchStatus = async (record: IntakeRecord, nextStatus: 'Pending OCR' | 'In review' | 'Rejected') => {
    setBusyId(record.id);
    setActionError('');
    try {
      const response = await fetch(`/api/form-intake/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json() as { record?: IntakeRecord; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error || 'The inbox status could not be updated.');
      onRecordChange(payload.record);
      return payload.record;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The inbox status could not be updated.');
      return null;
    } finally {
      setBusyId('');
    }
  };

  const beginReview = async (record: IntakeRecord) => {
    const updated = record.status === 'In review' ? record : await patchStatus(record, 'In review');
    if (updated) onReview(updated);
  };

  return <section className="intake-workspace" id="archive" aria-labelledby="intake-title">
    <div className="intake-intro">
      <div><p className="kicker">TEAM COLLECTION / EDITORIAL GATE</p><h2 id="intake-title">Submission inbox</h2><p>Google Form images arrive here first. Run enhancement and OCR, verify the extracted information, then approve the record into Clipping Evidence.</p>{formUrl && <a className="team-form-link" href={formUrl} target="_blank" rel="noreferrer">Open team collection form</a>}</div>
      <div className="intake-summary"><span><strong>{records.filter((record) => record.status === 'Pending OCR').length}</strong>Pending OCR</span><span><strong>{records.filter((record) => record.status === 'In review').length}</strong>In review</span><span><strong>{records.filter((record) => record.status === 'Approved').length}</strong>Approved</span></div>
    </div>
    {(loadError || actionError) && <div className="ingest-alert ingest-error" role="alert">{actionError || loadError} <button onClick={onReload}>Retry</button></div>}
    <div className="intake-controls">
      <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Headline, MCCIA, person, file…" /></label>
      <label>Year<select value={year} onChange={(event) => setYear(event.target.value)}><option>All</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Publisher<select value={publisher} onChange={(event) => setPublisher(event.target.value)}><option>All</option>{publishers.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>People / organisation<select value={presence} onChange={(event) => setPresence(event.target.value)}><option>All</option>{presences.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>DG classification<select value={dgEngagementType} onChange={(event) => setDgEngagementType(event.target.value)}><option>All</option>{DG_ENGAGEMENT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Pending OCR</option><option>In review</option><option>Approved</option><option>Rejected</option></select></label>
      <div className="intake-control-actions"><button onClick={clear} disabled={!active}>Clear</button><button onClick={() => downloadCsv(filtered)}>Export {filtered.length}</button></div>
    </div>
    <div className="intake-result-heading"><strong>{loading ? 'Loading submissions…' : `${filtered.length.toLocaleString('en-IN')} submission${filtered.length === 1 ? '' : 's'}`}</strong><span>Images remain in Drive and are mirrored privately for OCR review.</span></div>
    {!loading && !filtered.length ? <div className="empty-state"><strong>No matching submissions</strong><p>{records.length ? 'Change the inbox filters to see other workflow states.' : 'The inbox is ready. New Google Form submissions will appear here.'}</p><button onClick={clear}>Show all statuses</button></div> : <div className="intake-grid">
      {filtered.map((record) => <article className="intake-card" key={record.id}>
        <a className="intake-image" href={record.evidenceUrl || record.imageUrl} target="_blank" rel="noreferrer"><img src={record.isImage === false ? (record.originalContentType === 'application/pdf' ? '/fallbacks/pdf.webp' : '/fallbacks/video.webp') : record.imageUrl} alt={`${record.publisher} submission from ${record.publicationDate}`} loading="lazy" /><span>{record.originalFilename}</span></a>
        <div className="intake-card-body"><div className="card-meta"><span>{record.publisher}</span><time>{prettyDate(record.publicationDate)}{record.page ? ` · p.${record.page}` : ''}</time></div><h3>{record.headline || 'Headline requires OCR review'}</h3><p>{record.notes}</p><div className="tags"><span>{record.language}</span><span>{record.presence}</span>{intakeDgClassification(record)&&<span className="tag-dg-classification">{intakeDgClassification(record)}</span>}{record.mediaType&&<span>{record.mediaType}</span>}{record.ocrEngine&&<span>{record.ocrEngine}{record.ocrConfidence!=null?` · ${Math.round(record.ocrConfidence)}%`:''}</span>}{Number(record.duplicateScore)>=0.72&&<span className="tag-warning">Duplicate {Math.round(Number(record.duplicateScore)*100)}%</span>}{record.linkStatus&&<span>{record.linkStatus}{record.linkHttpStatus?` · HTTP ${record.linkHttpStatus}`:''}</span>}<span>{Math.max(1, Math.round(record.originalSize / 1024)).toLocaleString('en-IN')} KB</span>{record.submitterEmail && <span>{record.submitterEmail}</span>}</div>
          <div className="intake-provenance"><span>Inbox ID <strong>{record.id}</strong></span>{record.sheetRow && <span>Sheet row <strong>{record.sheetRow}</strong></span>}{record.approvedRecordId && <span>Evidence <strong>{record.approvedRecordId}</strong></span>}</div>
          <div className="intake-links">{record.driveFileUrl && <a href={record.driveFileUrl} target="_blank" rel="noreferrer">Drive original</a>}{record.driveFolderUrl && <a href={record.driveFolderUrl} target="_blank" rel="noreferrer">Year / month folder</a>}{record.sourceUrl && <a href={record.sourceUrl} target="_blank" rel="noreferrer">Public source</a>}</div>
          <div className="intake-actions"><span className={`intake-status intake-status-${record.status.toLowerCase().replaceAll(' ', '-')}`}>{record.status}</span><div>{record.status !== 'Approved' && record.status !== 'Rejected' && <><button className="intake-reject" onClick={() => void patchStatus(record, 'Rejected')} disabled={busyId === record.id}>{busyId === record.id ? 'Updating…' : 'Reject'}</button><button className="intake-review" onClick={() => void beginReview(record)} disabled={busyId === record.id}>Enhance &amp; OCR</button></>}{record.status === 'Rejected' && <button className="intake-review" onClick={() => void patchStatus(record, 'Pending OCR')} disabled={busyId === record.id}>Return to inbox</button>}{record.status === 'Approved' && <span className="intake-approved">Editorial approval complete</span>}</div></div>
        </div>
      </article>)}
    </div>}
    <details className="audit-trail"><summary>Editorial audit trail <span>{auditEvents.length.toLocaleString('en-IN')} events</span></summary><div>{auditEvents.slice(0,80).map((event)=><article key={event.id}><time>{new Date(event.createdAt).toLocaleString('en-IN')}</time><strong>{event.action.replaceAll('_',' ')}</strong><span>{event.recordId||'System'} · {event.actor} · {event.source}</span>{event.previousStatus||event.newStatus?<small>{event.previousStatus||'—'} → {event.newStatus||'—'}</small>:null}{event.details&&<p>{event.details}</p>}</article>)}</div></details>
  </section>;
}
