import {getStorageBindings} from '@/db';
export async function ensureTransferIndex(db:D1Database){await db.prepare('CREATE TABLE IF NOT EXISTS evidence_transfers (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)').run();}
export async function cleanupExpiredTransfers(limit=25){
 const {db,files}=getStorageBindings();await ensureTransferIndex(db);
 const rows=await db.prepare('SELECT id FROM evidence_transfers WHERE expires < ? ORDER BY expires LIMIT ?').bind(Date.now(),limit).all<{id:string}>();let removed=0;
 for(const {id} of rows.results||[]){
  if(!/^[a-f0-9-]{36}$/.test(id))continue;
  // Only the temporary transfer namespace is deleted, never published evidence.
  const manifest=await files.get(`transfers/${id}/manifest.json`);
  const descriptors=manifest?(await manifest.json<{files?:Record<string,{size:number}>}>()).files:null;
  const keys:string[]=[];
  for(const name of ['file','original','enhanced']){
   if(descriptors&&!descriptors[name])continue;
   const count=descriptors?Math.min(50,Math.max(0,Math.ceil(Number(descriptors[name].size)/(2*1024*1024)))):50;
   for(let part=0;part<count;part++)keys.push(`transfers/${id}/${name}/${part}`);
  }
  for(let offset=0;offset<keys.length;offset+=10)await Promise.all(keys.slice(offset,offset+10).map(key=>files.delete(key)));
  await files.delete(`transfers/${id}/manifest.json`);
  await db.prepare('DELETE FROM evidence_transfers WHERE id=?').bind(id).run();removed++;
 }
 return removed;
}
