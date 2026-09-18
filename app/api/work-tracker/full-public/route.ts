import records from '../../../work-tracker/public-records.json';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({items:records},{headers:{'Cache-Control':'no-store'}})}
