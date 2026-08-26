import { ensureFormIntakeSchema, getStorageBindings } from '@/db';

export const dynamic = 'force-dynamic';

type ImageRow = {
  original_key: string;
  original_content_type: string;
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { db, files } = getStorageBindings();
    await ensureFormIntakeSchema(db);
    const row = await db
      .prepare('SELECT original_key, original_content_type FROM google_form_intake WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ImageRow>();
    if (!row) return Response.json({ error: 'Inbox image not found.' }, { status: 404 });
    const object = await files.get(row.original_key);
    if (!object) return Response.json({ error: 'Inbox image not found.' }, { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || row.original_content_type,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to load the inbox image.' },
      { status: 503 },
    );
  }
}
