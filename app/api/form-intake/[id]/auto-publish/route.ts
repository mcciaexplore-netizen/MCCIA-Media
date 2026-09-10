import { ensureFormIntakeSchema, getStorageBindings } from '@/db';
import { authorizeAutomationRequest } from '../../../automation-auth';
import { publishAutomatically } from '../../../automatic-publication';
import { toIntakeRecord, type FormIntakeRow } from '../../route';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if (!(await authorizeAutomationRequest(request)).authorized) return Response.json({error:'Automation is not authorized.'},{status:401});
  try {
    const {id}=await context.params;const {db}=getStorageBindings();await ensureFormIntakeSchema(db);
    const row=await db.prepare('SELECT * FROM google_form_intake WHERE id=?').bind(id).first<FormIntakeRow>();
    if (!row) return Response.json({error:'Submission not found.'},{status:404});
    const publishedId=await publishAutomatically(db,row);
    const saved=await db.prepare('SELECT * FROM google_form_intake WHERE id=?').bind(id).first<FormIntakeRow>();
    return Response.json({record:toIntakeRecord(saved||row),publishedId});
  } catch(error) {return Response.json({error:error instanceof Error?error.message:'Automatic publication failed.'},{status:503});}
}
