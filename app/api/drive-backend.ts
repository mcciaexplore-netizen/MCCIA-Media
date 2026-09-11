import {createHmac,randomUUID} from 'node:crypto';
export const driveConfigured=()=>Boolean(process.env.DRIVE_GATEWAY_URL&&process.env.DRIVE_GATEWAY_SECRET);
export async function driveRequest<T=Record<string,unknown>>(action:string,data:Record<string,unknown>={}):Promise<T>{
 const url=process.env.DRIVE_GATEWAY_URL||'',secret=process.env.DRIVE_GATEWAY_SECRET||'';
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)||secret.length<32)throw new Error('The private Drive connection is not configured.');
 const payload=JSON.stringify({action,data,at:Date.now(),nonce:randomUUID()});
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:createHmac('sha256',secret).update(payload).digest('hex')}),cache:'no-store',signal:AbortSignal.timeout(55000)});
 if(!response.ok)throw new Error('Drive gateway could not be reached.');
 const body=await response.json() as {ok:boolean;data:T;error?:string};if(!body.ok)throw new Error(body.error||'Drive request failed.');return body.data;
}
export async function drivePage(request:Request,action:string){const p=new URL(request.url).searchParams;return Response.json(await driveRequest(action,{cursor:p.get('cursor')||'',limit:Math.min(100,Math.max(1,Number(p.get('limit'))||100))}),{headers:{'Cache-Control':'no-store'}})}
export async function driveImage(request:Request,id:string){
 const info=await driveRequest<{size:number;type:string;name:string}>('fileInfo',{id});
 if(!Number.isSafeInteger(info.size)||info.size<1||info.size>100*1024*1024)throw new Error('Invalid evidence size.');
 if(!/^(image\/(jpeg|png|webp)|application\/pdf|video\/(mp4|webm|quicktime))$/.test(info.type))throw new Error('Unsupported evidence type.');
 const range=request.headers.get('range');let start=0,end=info.size-1;
 if(range){const m=range.match(/^bytes=(\d+)-(\d*)$/);if(!m)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=info.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}})}
 let offset=start;const stream=new ReadableStream<Uint8Array>({async pull(controller){try{if(offset>end){controller.close();return}const until=Math.min(end,offset+512*1024-1);const part=await driveRequest<{base64:string}>('fileChunk',{id,start:offset,end:until});const bytes=new Uint8Array(Buffer.from(part.base64,'base64'));if(bytes.length!==until-offset+1)throw new Error('Incomplete Drive evidence');controller.enqueue(bytes);offset=until+1}catch(error){controller.error(error)}}});
 return new Response(stream,{status:range?206:200,headers:{'Content-Type':info.type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{ }),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
