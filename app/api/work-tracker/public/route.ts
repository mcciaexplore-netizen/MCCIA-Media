import {readItems} from '../store';
import {approvedPublicItems} from '../../../work-tracker/model';
import {driveConfigured,driveRequest} from '../../drive-backend';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 try{
  if(driveConfigured()){
   const result=await driveRequest<{items:unknown}>('trackerPublished');
   if(!Array.isArray(result.items))throw Error('Invalid tracker response');
   const items=result.items.map(p=>({id:p.id,title:p.title,category:p.category,stage:p.stage,publicationDate:p.publicationDate,completed:p.completed}));
   return Response.json({items,mode:'shared'},{headers});
  }
  if(process.env.NODE_ENV==='development')return Response.json({items:approvedPublicItems(await readItems()),mode:'local-preview'},{headers});
  return Response.json({error:'Shared public tracker storage is not configured.'},{status:503,headers});
 }catch{if(process.env.NODE_ENV==='development'){try{return Response.json({items:approvedPublicItems(await readItems()),mode:'local-preview',notice:'Showing saved approved updates on this computer. The shared connection is temporarily unavailable.'},{headers})}catch{}}return Response.json({error:'The public tracker connection is unavailable. Check that the updated Drive gateway is deployed.'},{status:503,headers})}
}
