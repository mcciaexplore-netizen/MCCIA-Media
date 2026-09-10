import {getStorageBindings} from '@/db';
import {authorizeEditor,editorRequired} from '../editor-auth';
import {authorizeAutomationRequest} from '../automation-auth';
export const dynamic='force-dynamic';
export const CHUNK_BYTES=2*1024*1024;
export const MAX_FILE_BYTES=100*1024*1024;
export type TransferFile={name:string;type:string;size:number;sha256:string};
export type Transfer={id:string;mode:'intake'|'review';actor:string;expires:number;files:Record<string,TransferFile>;metadata:Record<string,unknown>;result?:unknown;status?:number};
export const keyFor=(id:string)=>`transfers/${id}/manifest.json`;
export async function transferActor(request:Request,mode:string){return mode==='review'?authorizeEditor(request):authorizeAutomationRequest(request);}
export async function POST(request:Request){
 try{
  const body=await request.json() as Partial<Transfer>;
  if(!['intake','review'].includes(body.mode||''))return Response.json({error:'Invalid transfer type.'},{status:400});
  const auth=await transferActor(request,body.mode!);if(!auth.authorized)return editorRequired();
  const names=body.mode==='intake'?['file']:['original','enhanced'];
  if(!body.files||!body.metadata||typeof body.metadata!=='object'||JSON.stringify(body.metadata).length>200000)return Response.json({error:'File descriptors and metadata are required.'},{status:400});
  const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','video/quicktime']);
  const descriptors:Record<string,TransferFile>={};
  for(const name of names){const f=body.files[name];if(!f||!Number.isInteger(f.size)||f.size<1||f.size>MAX_FILE_BYTES||!allowed.has(f.type)||!/^[a-f0-9]{64}$/.test(f.sha256)||typeof f.name!=='string')return Response.json({error:'Each file must be a supported image, PDF or video, up to 100 MB, with a SHA-256 hash.'},{status:400});descriptors[name]={...f,name:f.name.slice(0,500)};}
  const transfer:Transfer={id:crypto.randomUUID(),mode:body.mode!,actor:auth.actor,expires:Date.now()+3600000,files:descriptors,metadata:body.metadata};
  const {files}=getStorageBindings();await files.put(keyFor(transfer.id),JSON.stringify(transfer),{httpMetadata:{contentType:'application/json'}});
  return Response.json({id:transfer.id,chunkBytes:CHUNK_BYTES},{status:201,headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to start evidence transfer.'},{status:503});}
}
