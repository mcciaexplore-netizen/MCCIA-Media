import {getStorageBindings} from '@/db';
import {POST as saveIntake} from '../../form-intake/route';
import {POST as saveReview} from '../../uploads/route';
import {CHUNK_BYTES,keyFor,transferActor,type Transfer} from '../route';
export const dynamic='force-dynamic';
export const maxDuration=300;
async function load(request:Request,id:string){
 if(!/^[a-f0-9-]{36}$/.test(id))return null;
 const {files}=getStorageBindings();const object=await files.get(keyFor(id));if(!object)return null;
 const transfer=await object.json<Transfer>();const auth=await transferActor(request,transfer.mode);
 if(!auth.authorized||auth.actor!==transfer.actor)return null;
 if(transfer.expires<Date.now())return null;return transfer;
}
export async function PUT(request:Request,context:{params:Promise<{id:string}>}){
 try{const {id}=await context.params;const transfer=await load(request,id);if(!transfer)return Response.json({error:'Transfer unavailable, expired or unauthorized.'},{status:404});
  if(transfer.result)return Response.json({error:'Transfer is already complete.'},{status:409});
  const p=new URL(request.url).searchParams,name=p.get('file')||'',part=Number(p.get('part'));
  const f=transfer.files[name];if(!p.has('part')||!f||!Number.isInteger(part)||part<0||part>=Math.ceil(f.size/CHUNK_BYTES))return Response.json({error:'Invalid evidence part.'},{status:400});
  const bytes=await request.arrayBuffer();const expected=Math.min(CHUNK_BYTES,f.size-part*CHUNK_BYTES);if(bytes.byteLength!==expected)return Response.json({error:'Evidence part has the wrong size.'},{status:400});
  const {files}=getStorageBindings();await files.put(`transfers/${id}/${name}/${part}`,bytes);return Response.json({received:part});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to receive evidence part.'},{status:503});}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{const {id}=await context.params;const transfer=await load(request,id);if(!transfer)return Response.json({error:'Transfer unavailable, expired or unauthorized.'},{status:404});
  if(transfer.result)return Response.json(transfer.result,{status:transfer.status||200});
  const {files}=getStorageBindings(),form=new FormData();
  for(const [name,f] of Object.entries(transfer.files)){
   const bytes=new Uint8Array(f.size);for(let part=0;part<Math.ceil(f.size/CHUNK_BYTES);part++){const object=await files.get(`transfers/${id}/${name}/${part}`);if(!object)return Response.json({error:`Evidence part ${part} is missing.`},{status:409});const chunk=new Uint8Array(await object.arrayBuffer());if(chunk.length!==Math.min(CHUNK_BYTES,f.size-part*CHUNK_BYTES))return Response.json({error:'Evidence part is incomplete.'},{status:409});bytes.set(chunk,part*CHUNK_BYTES);}
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==f.sha256)return Response.json({error:'Evidence checksum does not match the original file.'},{status:409});
   form.append(name,new File([bytes],f.name,{type:f.type}));
  }
  form.append('metadata',JSON.stringify(transfer.metadata));
  const headers=new Headers();for(const key of ['cookie','origin','authorization','x-mccia-intake-secret','x-mccia-editor-secret']){const value=request.headers.get(key);if(value)headers.set(key,value);}
  const internal=new Request(new URL(transfer.mode==='intake'?'/api/form-intake':'/api/uploads',request.url),{method:'POST',headers,body:form});
  const response=await (transfer.mode==='intake'?saveIntake(internal):saveReview(internal));const result=await response.json();
  if(response.ok){transfer.result=result;transfer.status=response.status;await files.put(keyFor(id),JSON.stringify(transfer),{httpMetadata:{contentType:'application/json'}});for(const [name,f]of Object.entries(transfer.files))for(let part=0;part<Math.ceil(f.size/CHUNK_BYTES);part++)await files.delete(`transfers/${id}/${name}/${part}`);}
  return Response.json(result,{status:response.status,headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to finalize evidence transfer.'},{status:503});}
}
