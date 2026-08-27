import { ensureFormIntakeSchema, getStorageBindings } from '@/db';
import { authorizeAutomationRequest } from '../automation-auth';

export const dynamic = 'force-dynamic';

type SourceRow = {
  id: string;
  discovered_at: string;
  publication_date: string | null;
  publisher: string;
  title: string;
  language: string;
  presence: string;
  topic: string;
  source_url: string;
  discovery_type: string;
  query_text: string | null;
  link_status: string;
  http_status: number | null;
  last_checked_at: string | null;
  verification_status: string;
  notes: string;
  updated_at: string;
};

type SourcePayload = {
  id?: string;
  discoveredAt?: string;
  date?: string;
  publisher?: string;
  title?: string;
  language?: string;
  presence?: string;
  topic?: string;
  url?: string;
  discoveryType?: string;
  query?: string;
  linkStatus?: string;
  httpStatus?: number;
  notes?: string;
};

function clean(value: unknown, maxLength: number, fallback = '') {
  const result = String(value ?? '').replace(/\0/g, '').trim();
  return (result || fallback).slice(0, maxLength);
}

function url(value: unknown) {
  const candidate = clean(value, 2000);
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? candidate : '';
  } catch {
    return '';
  }
}

function toRecord(row: SourceRow) {
  const date = row.publication_date || row.discovered_at.slice(0, 10);
  return {
    id: row.id,
    date,
    year: Number(date.slice(0, 4)) || 0,
    type: row.discovery_type.toLowerCase().includes('e-paper') ? 'PDF' : 'Article',
    format: row.discovery_type,
    publisher: row.publisher,
    title: row.title,
    language: row.language,
    presence: row.presence,
    topic: row.topic,
    description: row.notes,
    status: row.verification_status,
    url: row.source_url,
    mediaUrl: null,
    evidenceImageUrl: null,
    notes: `Link: ${row.link_status}${row.http_status ? ` (HTTP ${row.http_status})` : ''}. ${row.notes}`,
    sourceDataset: 'Automated source monitoring',
    sourceSearchStatus: row.discovery_type,
    verificationMethod: `${row.verification_status}; ${row.link_status}`,
    discoveredAt: row.discovered_at,
    linkStatus: row.link_status,
    httpStatus: row.http_status,
    query: row.query_text,
  };
}

export async function GET() {
  try {
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const result = await db.prepare('SELECT * FROM source_monitoring ORDER BY discovered_at DESC LIMIT 1000').all<SourceRow>();
    return Response.json({ records: (result.results ?? []).map(toRecord) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load monitored sources.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAutomationRequest(request);
    if (!authorization.authorized) return Response.json({ error: 'Source monitoring is not authorized.' }, { status: 401 });
    const payload = await request.json() as SourcePayload;
    const sourceUrl = url(payload.url);
    if (!sourceUrl) return Response.json({ error: 'A public HTTP(S) source URL is required.' }, { status: 400 });
    const id = clean(payload.id, 100) || `SRC-${crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
    const now = new Date().toISOString();
    const discoveredAt = clean(payload.discoveredAt, 100) || now;
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    await db.prepare(`INSERT INTO source_monitoring (
      id, discovered_at, publication_date, publisher, title, language, presence,
      topic, source_url, discovery_type, query_text, link_status, http_status,
      last_checked_at, verification_status, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_url) DO UPDATE SET
      discovered_at = excluded.discovered_at,
      publication_date = excluded.publication_date,
      publisher = excluded.publisher,
      title = excluded.title,
      language = excluded.language,
      presence = excluded.presence,
      topic = excluded.topic,
      discovery_type = excluded.discovery_type,
      query_text = excluded.query_text,
      link_status = excluded.link_status,
      http_status = excluded.http_status,
      last_checked_at = excluded.last_checked_at,
      verification_status = excluded.verification_status,
      notes = excluded.notes,
      updated_at = excluded.updated_at`)
      .bind(
        id,
        discoveredAt,
        clean(payload.date, 10) || null,
        clean(payload.publisher, 250, 'Publisher not recorded'),
        clean(payload.title, 1000, 'Untitled source candidate'),
        clean(payload.language, 100, 'Unknown'),
        clean(payload.presence, 500, 'MCCIA relevance requires review'),
        clean(payload.topic, 250, 'MCCIA media monitoring'),
        sourceUrl,
        clean(payload.discoveryType, 200, 'Automated discovery'),
        clean(payload.query, 1000) || null,
        clean(payload.linkStatus, 100, 'Unchecked'),
        Number.isFinite(Number(payload.httpStatus)) ? Math.trunc(Number(payload.httpStatus)) : null,
        now,
        'Unverified',
        clean(payload.notes, 3000, 'Automated discovery; editorial verification required.'),
        now,
      )
      .run();
    const row = await db.prepare('SELECT * FROM source_monitoring WHERE source_url = ? LIMIT 1').bind(sourceUrl).first<SourceRow>();
    return Response.json({ record: row ? toRecord(row) : null }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save monitored source.' }, { status: 500 });
  }
}
