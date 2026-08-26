import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const candidate = env.GOOGLE_FORM_URL?.trim() || '';
  let formUrl = '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && ['docs.google.com', 'forms.gle'].includes(parsed.hostname)) formUrl = candidate;
  } catch {
    // The dashboard remains usable before the Google Form URL is configured.
  }
  return Response.json({ formUrl }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
