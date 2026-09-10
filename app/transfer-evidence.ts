async function checked(response:Response){const body=await response.json() as {error?:string;id?:string;chunkBytes?:number};if(!response.ok)throw new Error(body.error||`Evidence transfer failed: HTTP ${response.status}`);return body;}
export async function transferEvidence(files:Record<string,File>,metadata:Record<string,unknown>){
 const descriptors:Record<string,{name:string;type:string;size:number;sha256:string}>={};
 for(const [name,file]of Object.entries(files)){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());descriptors[name]={name:file.name,type:file.type,size:file.size,sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};}
 const session=await checked(await fetch('/api/evidence-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'review',files:descriptors,metadata})}));
 if(!session.id||!session.chunkBytes)throw new Error('Invalid transfer session.');
 for(const [name,file]of Object.entries(files))for(let start=0;start<file.size;start+=session.chunkBytes){const url=`/api/evidence-transfer/${session.id}?file=${name}&part=${start/session.chunkBytes}`;const data=file.slice(start,start+session.chunkBytes);let last:unknown;
  for(let attempt=0;attempt<3;attempt++){try{await checked(await fetch(url,{method:'PUT',body:data}));last=null;break}catch(error){last=error;}}
  if(last)throw last;
 }
 return fetch(`/api/evidence-transfer/${session.id}`,{method:'POST'});
}
