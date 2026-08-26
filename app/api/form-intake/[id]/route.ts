import { ensureFormIntakeSchema, getStorageBindings } from '@/db';
import { FormIntakeRow, toIntakeRecord } from '../route';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['Pending OCR', 'In review', 'Approved', 'Rejected']);

function clean(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, maxLength);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as { status?: string; approvedRecordId?: string; errorMessage?: string };
    const status = clean(payload.status, 50);
    if (!ALLOWED_STATUSES.has(status)) return Response.json({ error: 'Choose a valid intake status.' }, { status: 400 });
    const approvedRecordId = clean(payload.approvedRecordId, 200) || null;
    if (status === 'Approved' && !approvedRecordId) {
      return Response.json({ error: 'An approved clipping record ID is required.' }, { status: 400 });
    }
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const updated = await db.prepare(`UPDATE google_form_intake
      SET status = ?, error_message = ?, approved_record_id = ?, approved_at = ?
      WHERE id = ?`)
      .bind(
        status,
        clean(payload.errorMessage, 2000) || null,
        status === 'Approved' ? approvedRecordId : null,
        status === 'Approved' ? new Date().toISOString() : null,
        id,
      )
      .run();
    if (!updated.meta.changes) return Response.json({ error: 'Inbox record not found.' }, { status: 404 });
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
