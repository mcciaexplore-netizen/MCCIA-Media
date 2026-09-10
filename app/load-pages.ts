/** Collect every page; an interrupted request is an error, never an empty archive. */
export async function loadPages<T>(url:string,key='records'){
 const results:T[]=[];const cursors=new Set<string>();let cursor:string|null=null;
 do{const r:Response=await fetch(`${url}${url.includes('?')?'&':'?'}limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{cache:'no-store'});const body=await r.json() as Record<string,unknown>;if(!r.ok)throw new Error(String(body.error||`HTTP ${r.status}`));if(!Array.isArray(body[key]))throw new Error('The server returned an invalid page.');results.push(...body[key] as T[]);cursor=typeof body.nextCursor==='string'?body.nextCursor:null;if(cursor&&cursors.has(cursor))throw new Error('The server repeated a page cursor.');if(cursor)cursors.add(cursor);}while(cursor);
 return results;
}
