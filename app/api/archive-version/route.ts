import metadata from '@/app/archive-metadata.json';
import discovery from '@/app/discovery-status.json';

export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({version:`${metadata.dataHash}:${discovery.checkedAt}`},
    {headers:{'Cache-Control':'no-store'}});
}
