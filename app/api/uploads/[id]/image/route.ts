import { ensureUploadsSchema, getStorageBindings } from '@/db';

export const dynamic = 'force-dynamic';

type ImageRow = {
  original_key: string;
  enhanced_key: string;
  original_content_type: string;
  enhanced_content_type: string;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const variant = new URL(request.url).searchParams.get('variant') === 'original' ? 'original' : 'enhanced';
    const { db, files } = getStorageBindings();
    await ensureUploadsSchema(db);
    const row = await db
      .prepare('SELECT original_key, enhanced_key, original_content_type, enhanced_content_type FROM clipping_uploads WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ImageRow>();
    if (!row) return Response.json({ error: 'Clipping image not found.' }, { status: 404 });
    const key = variant === 'original' ? row.original_key : row.enhanced_key;
    const contentType = variant === 'original' ? row.original_content_type : row.enhanced_content_type;
    const object = await files.get(key);
    if (!object) return Response.json({ error: 'Clipping image not found.' }, { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || contentType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to load the clipping image.' },
      { status: 503 },
    );
  }
}
