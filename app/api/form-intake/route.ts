import { ensureFormIntakeSchema, getGoogleFormIntakeSecret, getStorageBindings } from '@/db';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  notes: string;
  source_url: string | null;
  status: string;
  error_message: string | null;
  approved_at: string | null;
  approved_record_id: string | null;
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
  notes?: string;
  sourceUrl?: string;
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
    originalContentType: row.original_content_type,
    originalSize: row.original_size,
    publicationDate: row.publication_date,
    year: Number(row.publication_date.slice(0, 4)) || 0,
    publisher: row.publisher,
    page: row.page,
    language: row.language,
    headline: row.headline,
    presence: row.presence,
    notes: row.notes,
    sourceUrl: row.source_url,
    status: row.status,
    errorMessage: row.error_message,
    approvedAt: row.approved_at,
    approvedRecordId: row.approved_record_id,
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
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function digestSecret(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function authorized(request: Request) {
  const expected = getGoogleFormIntakeSecret();
  const supplied = request.headers.get('x-mccia-intake-secret') || '';
  if (!expected || !supplied) return false;
  const [left, right] = await Promise.all([digestSecret(expected), digestSecret(supplied)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ (right[index] ?? 0);
  return difference === 0;
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
    if (!(await authorized(request))) return jsonError('The intake webhook is not authorized.', 401);
    const form = await request.formData();
    const file = form.get('file');
    const metadataValue = form.get('metadata');
    if (!(file instanceof File) || typeof metadataValue !== 'string') {
      return jsonError('A clipping image and metadata are required.', 400);
    }
    if (!ACCEPTED_TYPES.has(file.type)) return jsonError('Use a JPG, PNG or WebP newspaper image.', 415);
    if (!file.size || file.size > MAX_IMAGE_BYTES) return jsonError('Each clipping must be between 1 byte and 20 MB.', 413);

    let metadata: IntakeMetadata;
    try {
      metadata = JSON.parse(metadataValue) as IntakeMetadata;
    } catch {
      return jsonError('The intake metadata is not valid JSON.', 400);
    }
    const publicationDate = validDate(metadata.publicationDate);
    if (!publicationDate) return jsonError('A valid publication date is required.', 400);

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
    try {
      await db.prepare(`INSERT INTO google_form_intake (
        id, sha256, received_at, form_timestamp, form_response_id, drive_file_id,
        drive_file_url, drive_folder_url, sheet_row, submitter_email, original_filename,
        original_key, original_content_type, original_size, publication_date, publisher,
        page, language, headline, presence, notes, source_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
          clean(metadata.notes, 2000, 'Submitted through the MCCIA team collection form.'),
          validUrl(metadata.sourceUrl),
          'Pending OCR',
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
