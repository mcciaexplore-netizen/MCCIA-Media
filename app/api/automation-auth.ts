import { getGoogleFormIntakeSecret } from '@/db';

const AUTOMATION_OWNER = 'mccianewsclipping@gmail.com';

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function matchesConfiguredSecret(supplied: string) {
  const expected = getGoogleFormIntakeSecret();
  if (!expected || !supplied) return false;
  const [left, right] = await Promise.all([digest(expected), digest(supplied)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ (right[index] ?? 0);
  return difference === 0;
}

async function isOwnerGoogleToken(authorization: string) {
  if (!authorization.startsWith('Bearer ')) return false;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: authorization },
      cf: { cacheTtl: 0 },
    });
    if (!response.ok) return false;
    const profile = await response.json() as { email?: string; email_verified?: boolean };
    return profile.email_verified !== false && profile.email?.toLowerCase() === AUTOMATION_OWNER;
  } catch {
    return false;
  }
}

export async function authorizeAutomationRequest(request: Request) {
  const secret = request.headers.get('x-mccia-intake-secret') || '';
  if (await matchesConfiguredSecret(secret)) return { authorized: true, actor: 'Apps Script shared secret' };
  const authorization = request.headers.get('authorization') || '';
  if (await isOwnerGoogleToken(authorization)) return { authorized: true, actor: AUTOMATION_OWNER };
  return { authorized: false, actor: '' };
}
