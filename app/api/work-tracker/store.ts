import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateItem,fields,applyAction,type WorkItem,type DocumentVersion} from '../../work-tracker/model';
import type {Identity} from './access';
const directory=join(process.cwd(),'.local-work-tracker');
const file=join(directory,'records.json');
export async function readItems():Promise<WorkItem[]>{try{const data=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(data))throw Error('Invalid tracker file');return data;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}}
// A process-local queue plus revision checks prevents overlapping writes in the local server.
let queue:Promise<unknown>=Promise.resolve();
export function saveItem(input:Record<string,unknown>,actor:Identity={id:'local-owner',name:process.env.USERNAME||'Local owner',role:'Administrator'}):Promise<WorkItem>{
 const operation=queue.then(async()=>{
  if(actor.role==='Viewer')throw Error('Your role can view items but cannot edit them.');
  const items=await readItems();
  const previous=input.id?items.find(x=>x.id===input.id):undefined;
  if(input.id&&!previous)throw Error('Item not found.');
  if(previous&&input.revision!==previous.revision)throw Error('This item changed in another window. Reload the tracker before saving.');
  const action=typeof input.action==='string'?input.action:'';
  const comment=typeof input.comment==='string'?input.comment.trim():'';
  if(comment.length>5000)throw Error('Comment is too long.');
  if(actor.role==='Editor'&&(action.startsWith('Approve')||action==='Request changes'||(input.stage!==undefined&&input.stage!==previous?.stage&&['Design','Approved','Ready for release','Completed','Published','Closed'].includes(String(input.stage)))))throw Error('A reviewer or administrator must authorise this stage.');
  if(action&&!previous)throw Error('Save the item before taking a workflow action.');
  let item=validateItem(input,previous);const at=new Date().toISOString();
  if(action){if(input.stage!==previous?.stage)throw Error('Save stage edits before taking an action.');item=validateItem(applyAction(item,action,comment),previous);}
  if(input.newDocument){const doc=input.newDocument as Record<string,unknown>;
   const name=String(doc.name||'').trim(),url=String(doc.url||'').trim(),version=String(doc.version||'').trim(),kind=String(doc.kind||'');
   if(!name||!version||name.length>250||version.length>100||url.length>2000||!['Working document','Final PDF','Supporting file'].includes(kind))throw Error('Provide a document name, version and type.');
   try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error();}catch{throw Error('Document links must use http or https.');}
   item.documents=[...(previous?.documents||[]),{id:randomUUID(),name,url,version,kind:kind as DocumentVersion['kind'],addedAt:at,addedBy:actor.name}];
  }
  const changes=previous?[...fields.filter(f=>(previous[f]??(f==='priority'?'Normal':''))!==item[f]),...(input.newDocument?['document']:[]),...((previous.sourceConfirmed??false)!==(item.sourceConfirmed??false)?['sourceConfirmation']:[])]:[];
  if(previous&&!changes.length&&!action&&!comment)return previous;
  item.id=previous?.id??`WORK-${randomUUID().slice(0,8).toUpperCase()}`;
  item.updatedAt=at;item.revision=(previous?.revision??0)+1;
  item.history=[...(previous?.history??[]),{at,actor:actor.name,comment,fromStage:previous?.stage,toStage:item.stage,summary:action|| (previous?changes.map(f=>f==='stage'?`Stage: ${previous.stage} → ${item.stage}`:`Updated ${f.replace(/([A-Z])/g,' $1').toLowerCase()}`).join('; ')||'Comment added':'Created locally') }];
  const next=previous?items.map(x=>x.id===item.id?item:x):[item,...items];
  await mkdir(directory,{recursive:true});const temp=join(directory,`${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(next,null,2)+'\n','utf8');await rename(temp,file);return item;
 });
 queue=operation.catch(()=>{});return operation;
}
export function localRequest(request:Request){
 if(process.env.NODE_ENV!=='development')return false;
 const url=new URL(request.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return false;
 const origin=request.headers.get('origin');
 // Next's local server canonicalizes request.url to localhost even when the
 // browser uses 127.0.0.1. Check the browser-facing Host, still loopback-only.
 const authority=new URL(`${url.protocol}//${request.headers.get('host')||url.host}`);
 if(!['localhost','127.0.0.1','[::1]'].includes(authority.hostname))return false;
 if(origin&&origin!==authority.origin)return false;
 return request.headers.get('sec-fetch-site')!=='cross-site';
}
