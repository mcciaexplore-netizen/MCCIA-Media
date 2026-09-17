import {readItems} from '../store';
import {approvedPublicItems} from '../../../work-tracker/model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 if(process.env.NODE_ENV!=='development')return Response.json({error:'Shared public tracker storage is not configured.'},{status:503,headers});
 try{return Response.json({items:approvedPublicItems(await readItems()),mode:'local-preview'},{headers})}catch{return Response.json({error:'The public tracker is temporarily unavailable.'},{status:503,headers})}
}
