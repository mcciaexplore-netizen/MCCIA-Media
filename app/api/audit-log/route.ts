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

export async function GET() {
  try {
    const { db } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const result = await db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 250').all<AuditRow>();
    return Response.json({
      events: (result.results ?? []).map((row) => ({
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
