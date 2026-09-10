import { authorizeEditor, editorRequired } from '../editor-auth';
import { pageRequest, pageResult } from '../pagination';
import { ensureFormIntakeSchema, getStorageBindings } from '@/db';

export const dynamic = 'force-dynamic';

type AuditRow = {
  id: string;
  created_at: string;
  record_id: string | null;
  action: string;
  actor: string;
  previous_status: string | null;
  new_status: string | null;
  details: string | null;
  source: string;
};

export async function GET(request: Request) {
  if(!(await authorizeEditor(request)).authorized)return editorRequired();
  try {
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const {limit,before}=pageRequest(request);
    const result=await db.prepare('SELECT * FROM audit_events WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?').bind(before?.at??null,before?.at??null,before?.at??null,before?.id??null,limit+1).all<AuditRow>();
    const page=pageResult(result.results??[],limit,r=>r.created_at,r=>r.id);
    return Response.json({
      nextCursor: page.nextCursor,
      events: page.records.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        recordId: row.record_id,
        action: row.action,
        actor: row.actor,
        previousStatus: row.previous_status,
        newStatus: row.new_status,
        details: row.details,
        source: row.source,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load the audit log.' }, { status: 503 });
  }
}
