import { ensureFormIntakeSchema, ensureUploadsSchema, getStorageBindings } from '@/db';
import { authorizeAutomationRequest } from '../../automation-auth';
import { FormIntakeRow, toIntakeRecord } from '../route';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['Pending OCR', 'In review', 'Approved', 'Rejected']);

type ApprovalRow = FormIntakeRow & {
  original_key: string;
  original_content_type: string;
  original_size: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_engine: string | null;
  verification_status: string | null;
};

type PatchPayload = {
  status?: string;
  approvedRecordId?: string;
  errorMessage?: string;
  actor?: string;
  headline?: string;
  ocrText?: string;
  ocrConfidence?: number;
  verificationStatus?: string;
};

function clean(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, maxLength);
}

async function approveFromAutomation(db: D1Database, row: ApprovalRow, payload: PatchPayload) {
  await ensureUploadsSchema(db);
  const existing = await db.prepare('SELECT id FROM clipping_uploads WHERE sha256 = ? LIMIT 1')
    .bind(row.sha256)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const approvedId = `APR-${row.sha256.slice(0, 12).toUpperCase()}`;
  const now = new Date().toISOString();
  const ocrText = clean(payload.ocrText, 100_000) || row.ocr_text || row.headline;
  const confidence = Number.isFinite(Number(payload.ocrConfidence))
    ? Math.max(0, Math.min(100, Number(payload.ocrConfidence)))
    : row.ocr_confidence;
  await db.prepare(`INSERT INTO clipping_uploads (
    id, sha256, uploaded_at, original_filename, original_key, enhanced_key,
    original_content_type, enhanced_content_type, original_size, enhanced_size,
    width, height, publisher, publication_date, page, language, headline,
    ocr_text, ocr_confidence, ocr_languages, presence, status, reviewed, notes, source_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      approvedId,
      row.sha256,
      now,
      row.original_filename,
      row.original_key,
      row.original_key,
      row.original_content_type,
      row.original_content_type,
      row.original_size,
      row.original_size,
      1,
      1,
      row.publisher,
      row.publication_date,
      row.page,
      row.language,
      clean(payload.headline, 500) || row.headline,
      ocrText,
      confidence,
      row.ocr_engine || 'Google Drive OCR',
      row.presence,
      'Approved · automated form intake',
      1,
      `${row.notes}\nApproved from the MCCIA editorial Sheet. Verification: ${clean(payload.verificationStatus, 100) || row.verification_status || 'Unverified'}`.slice(0, 2000),
      row.source_url,
    )
    .run();
  return approvedId;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as PatchPayload;
    const status = clean(payload.status, 50);
    if (!ALLOWED_STATUSES.has(status)) return Response.json({ error: 'Choose a valid intake status.' }, { status: 400 });

    const authorization = await authorizeAutomationRequest(request);
    if (status === 'Approved' && !authorization.authorized) {
      return Response.json({ error: 'Automated approval requires the authorized MCCIA Apps Script account.' }, { status: 401 });
    }

    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const current = await db.prepare('SELECT * FROM google_form_intake WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ApprovalRow>();
    if (!current) return Response.json({ error: 'Inbox record not found.' }, { status: 404 });

    let approvedRecordId = clean(payload.approvedRecordId, 200) || current.approved_record_id;
    if (status === 'Approved' && !approvedRecordId) approvedRecordId = await approveFromAutomation(db, current, payload);

    const now = new Date().toISOString();
    const actor = clean(payload.actor, 500) || authorization.actor || 'Dashboard editor';
    await db.prepare(`UPDATE google_form_intake
      SET status = ?, error_message = ?, approved_record_id = ?, approved_at = ?,
          headline = ?, ocr_text = ?, ocr_confidence = ?, verification_status = ?,
          reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?`)
      .bind(
        status,
        clean(payload.errorMessage, 2000) || null,
        status === 'Approved' ? approvedRecordId : null,
        status === 'Approved' ? now : null,
        clean(payload.headline, 500) || current.headline,
        clean(payload.ocrText, 100_000) || current.ocr_text,
        Number.isFinite(Number(payload.ocrConfidence)) ? Math.max(0, Math.min(100, Number(payload.ocrConfidence))) : current.ocr_confidence,
        clean(payload.verificationStatus, 100) || current.verification_status,
        actor,
        now,
        now,
        id,
      )
      .run();

    await db.prepare(`INSERT INTO audit_events (
      id, created_at, record_id, action, actor, previous_status, new_status, details, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), now, id, 'EDITORIAL_STATUS_CHANGED', actor,
        current.status, status,
        status === 'Approved' ? `Approved as ${approvedRecordId}` : clean(payload.errorMessage, 2000) || 'Editorial workflow update',
        authorization.authorized ? 'Google Sheet automation' : 'Dashboard review UI',
      )
      .run();

    const row = await db.prepare('SELECT * FROM google_form_intake WHERE id = ?').bind(id).first<FormIntakeRow>();
    if (!row) return Response.json({ error: 'Inbox record not found.' }, { status: 404 });
    return Response.json({ record: toIntakeRecord(row) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to update the inbox record.' },
      { status: 500 },
    );
  }
}
