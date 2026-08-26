import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

const DEFAULT_GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/1Ejcmw09OgeMwyx1KhBsx7e9KjnjdrMSojXE41haeS7c/viewform';

export async function GET() {
  const candidate = env.GOOGLE_FORM_URL?.trim() || DEFAULT_GOOGLE_FORM_URL;
  let formUrl = '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && ['docs.google.com', 'forms.gle'].includes(parsed.hostname)) formUrl = candidate;
  } catch {
    // The dashboard remains usable before the Google Form URL is configured.
  }
  return Response.json({ formUrl }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
