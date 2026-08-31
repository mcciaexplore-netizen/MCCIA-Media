import { ensureFormIntakeSchema, getStorageBindings } from '@/db';
import { inferDgEngagementType, normalizeDgEngagementType } from '@/app/dg-classification';
import { authorizeAutomationRequest } from '../automation-auth';

export const dynamic = 'force-dynamic';

const MAX_EVIDENCE_BYTES = 45 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

export type FormIntakeRow = {
  id: string;
  sha256: string;
  received_at: string;
  form_timestamp: string | null;
  form_response_id: string | null;
  drive_file_id: string | null;
  drive_file_url: string | null;
  drive_folder_url: string | null;
  sheet_row: number | null;
  submitter_email: string | null;
  original_filename: string;
  original_key: string;
  original_content_type: string;
  original_size: number;
  publication_date: string;
  publisher: string;
  page: string | null;
  language: string;
  headline: string;
  presence: string;
  dg_engagement_type: string | null;
  notes: string;
  source_url: string | null;
  status: string;
  error_message: string | null;
  approved_at: string | null;
  approved_record_id: string | null;
  edition_city: string | null;
  media_type: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_engine: string | null;
  duplicate_score: number | null;
  duplicate_record_id: string | null;
  duplicate_reasons: string | null;
  link_status: string | null;
  link_http_status: number | null;
  last_link_check: string | null;
  verification_status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
};

type IntakeMetadata = {
  formTimestamp?: string;
  formResponseId?: string;
  driveFileId?: string;
  driveFileUrl?: string;
  driveFolderUrl?: string;
  sheetRow?: number;
  submitterEmail?: string;
  publicationDate?: string;
  publisher?: string;
  page?: string;
  language?: string;
  headline?: string;
  presence?: string;
  dgEngagementType?: string;
  notes?: string;
  sourceUrl?: string;
  editionCity?: string;
  mediaType?: string;
  ocrText?: string;
  ocrConfidence?: number;
  ocrEngine?: string;
  duplicateScore?: number;
  duplicateRecordId?: string;
  duplicateReasons?: string;
  linkStatus?: string;
  linkHttpStatus?: number;
};

export function toIntakeRecord(row: FormIntakeRow) {
  return {
    id: row.id,
    sha256: row.sha256,
    receivedAt: row.received_at,
    formTimestamp: row.form_timestamp,
    formResponseId: row.form_response_id,
    driveFileId: row.drive_file_id,
    driveFileUrl: row.drive_file_url,
    driveFolderUrl: row.drive_folder_url,
    sheetRow: row.sheet_row,
    submitterEmail: row.submitter_email,
    originalFilename: row.original_filename,
    imageUrl: `/api/form-intake/${encodeURIComponent(row.id)}/image`,
    evidenceUrl: `/api/form-intake/${encodeURIComponent(row.id)}/image`,
    isImage: row.original_content_type.startsWith('image/'),
    originalContentType: row.original_content_type,
    originalSize: row.original_size,
    publicationDate: row.publication_date,
    year: Number(row.publication_date.slice(0, 4)) || 0,
    publisher: row.publisher,
    page: row.page,
    language: row.language,
    headline: row.headline,
    presence: row.presence,
    dgEngagementType: normalizeDgEngagementType(row.dg_engagement_type),
    notes: row.notes,
    sourceUrl: row.source_url,
    status: row.status,
    errorMessage: row.error_message,
    approvedAt: row.approved_at,
    approvedRecordId: row.approved_record_id,
    editionCity: row.edition_city,
    mediaType: row.media_type,
    ocrText: row.ocr_text,
    ocrConfidence: row.ocr_confidence,
    ocrEngine: row.ocr_engine,
    duplicateScore: row.duplicate_score,
    duplicateRecordId: row.duplicate_record_id,
    duplicateReasons: row.duplicate_reasons,
    linkStatus: row.link_status,
    linkHttpStatus: row.link_http_status,
    lastLinkCheck: row.last_link_check,
    verificationStatus: row.verification_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function clean(value: unknown, maxLength: number, fallback = '') {
  const result = String(value ?? '').replace(/\0/g, '').trim();
  return (result || fallback).slice(0, maxLength);
}

function validDate(value: unknown) {
  const candidate = clean(value, 10);
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const expected = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(expected[0], expected[1] - 1, expected[2]));
  return parsed.getUTCFullYear() === expected[0] && parsed.getUTCMonth() + 1 === expected[1] && parsed.getUTCDate() === expected[2]
    ? candidate
    : null;
}

function validUrl(value: unknown) {
  const candidate = clean(value, 2000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

function extensionFor(type: string) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'video/webm') return 'webm';
  if (type === 'video/quicktime') return 'mov';
  if (type === 'video/mp4') return 'mp4';
  return 'jpg';
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function GET() {
  try {
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const result = await db
      .prepare('SELECT * FROM google_form_intake ORDER BY received_at DESC LIMIT 500')
      .all<FormIntakeRow>();
    return Response.json(
      { records: (result.results ?? []).map(toIntakeRecord) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load the submission inbox.', 503);
  }
}

export async function POST(request: Request) {
  let originalKey = '';
  try {
    const authorization = await authorizeAutomationRequest(request);
    if (!authorization.authorized) return jsonError('The intake webhook is not authorized.', 401);
    const form = await request.formData();
    const file = form.get('file');
    const metadataValue = form.get('metadata');
    if (!(file instanceof File) || typeof metadataValue !== 'string') {
      return jsonError('A clipping image and metadata are required.', 400);
    }
    if (!ACCEPTED_TYPES.has(file.type)) return jsonError('Use an image, PDF or supported video evidence file.', 415);
    if (!file.size || file.size > MAX_EVIDENCE_BYTES) return jsonError('Each evidence file must be between 1 byte and 45 MB.', 413);

    let metadata: IntakeMetadata;
    try {
      const parsed = JSON.parse(metadataValue) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid metadata object');
      metadata = parsed as IntakeMetadata;
    } catch {
      return jsonError('The intake metadata is not valid JSON.', 400);
    }
    const publicationDate = validDate(metadata.publicationDate);
    if (!publicationDate) return jsonError('A valid publication date is required.', 400);
    const requestedDgEngagementType = clean(metadata.dgEngagementType, 100);
    const normalizedDgEngagementType = normalizeDgEngagementType(requestedDgEngagementType);
    if (requestedDgEngagementType && !normalizedDgEngagementType) {
      return jsonError('Choose one of the three available DG content classifications.', 400);
    }

    const hash = await sha256(file);
    const id = `INT-${hash.slice(0, 12).toUpperCase()}`;
    const { db, files } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const existing = await db.prepare('SELECT * FROM google_form_intake WHERE sha256 = ? LIMIT 1').bind(hash).first<FormIntakeRow>();
    if (existing) return Response.json({ record: toIntakeRecord(existing), duplicate: true });

    originalKey = `form-intake/${hash}/original.${extensionFor(file.type)}`;
    await files.put(originalKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { intakeId: id, sha256: hash, source: 'google-form' },
    });

    const receivedAt = new Date().toISOString();
    const initialStatus = clean(metadata.ocrText, 100_000) ? 'In review' : 'Pending OCR';
    const confidence = Number.isFinite(Number(metadata.ocrConfidence)) ? Math.max(0, Math.min(100, Number(metadata.ocrConfidence))) : null;
    const duplicateScore = Number.isFinite(Number(metadata.duplicateScore)) ? Math.max(0, Math.min(1, Number(metadata.duplicateScore))) : null;
    const dgEngagementType = normalizedDgEngagementType
      ?? inferDgEngagementType(`${metadata.headline || ''} ${metadata.ocrText || ''} ${metadata.presence || ''}`);
    try {
      await db.prepare(`INSERT INTO google_form_intake (
        id, sha256, received_at, form_timestamp, form_response_id, drive_file_id,
        drive_file_url, drive_folder_url, sheet_row, submitter_email, original_filename,
        original_key, original_content_type, original_size, publication_date, publisher,
        page, language, headline, presence, dg_engagement_type, notes, source_url, status,
        edition_city, media_type, ocr_text, ocr_confidence, ocr_engine,
        duplicate_score, duplicate_record_id, duplicate_reasons, link_status,
        link_http_status, last_link_check, verification_status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          hash,
          receivedAt,
          clean(metadata.formTimestamp, 100) || null,
          clean(metadata.formResponseId, 500) || null,
          clean(metadata.driveFileId, 500) || null,
          validUrl(metadata.driveFileUrl),
          validUrl(metadata.driveFolderUrl),
          Number.isFinite(Number(metadata.sheetRow)) ? Math.max(1, Math.trunc(Number(metadata.sheetRow))) : null,
          clean(metadata.submitterEmail, 500) || null,
          clean(file.name, 500, 'newspaper-clipping'),
          originalKey,
          file.type,
          file.size,
          publicationDate,
          clean(metadata.publisher, 200, 'Publisher requires review'),
          clean(metadata.page, 50) || null,
          clean(metadata.language, 100, 'Unknown'),
          clean(metadata.headline, 500, 'Headline requires OCR review'),
          clean(metadata.presence, 200, 'MCCIA relevance requires review'),
          dgEngagementType,
          clean(metadata.notes, 2000, 'Submitted through the MCCIA team collection form.'),
          validUrl(metadata.sourceUrl),
          initialStatus,
          clean(metadata.editionCity, 200) || null,
          clean(metadata.mediaType, 100) || null,
          clean(metadata.ocrText, 100_000) || null,
          confidence,
          clean(metadata.ocrEngine, 100) || null,
          duplicateScore,
          clean(metadata.duplicateRecordId, 200) || null,
          clean(metadata.duplicateReasons, 2000) || null,
          clean(metadata.linkStatus, 100) || null,
          Number.isFinite(Number(metadata.linkHttpStatus)) ? Math.trunc(Number(metadata.linkHttpStatus)) : null,
          metadata.linkStatus ? receivedAt : null,
          duplicateScore != null && duplicateScore >= 0.72 ? 'Potential duplicate — verify' : 'Unverified',
          receivedAt,
        )
        .run();
      await db.prepare(`INSERT INTO audit_events (
        id, created_at, record_id, action, actor, previous_status, new_status, details, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(), receivedAt, id, 'INTAKE_RECEIVED', authorization.actor,
          null, initialStatus, 'Evidence stored in R2 with OCR and duplicate metadata.', 'Google Form automation',
        )
        .run();
    } catch (error) {
      await files.delete(originalKey);
      throw error;
    }

    const saved = await db.prepare('SELECT * FROM google_form_intake WHERE id = ?').bind(id).first<FormIntakeRow>();
    if (!saved) throw new Error('The intake image was stored but its metadata could not be reloaded.');
    return Response.json({ record: toIntakeRecord(saved), duplicate: false }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to add the clipping to the inbox.', 500);
  }
}
