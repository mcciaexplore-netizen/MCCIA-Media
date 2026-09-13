import {localRequest} from '../store';
import {accessStatus,changeAccess} from '../access';
export const runtime='nodejs';export const dynamic='force-dynamic';
const attempts=new Map<string,{count:number;at:number}>();
export async function GET(request:Request){if(!localRequest(request))return new Response('Not found',{status:404});try{return Response.json(await accessStatus(request),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Local access settings are unavailable.'},{status:503})}}
export async function POST(request:Request){if(!localRequest(request))return new Response('Not found',{status:404});try{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required.');
 const text=await request.text();if(text.length>4096)throw Error('Request too large.');const input=JSON.parse(text);
 if(input.action==='login'){const key=String(input.name||'').toLowerCase(),old=attempts.get(key),entry=old&&Date.now()-old.at<60000?old:{count:0,at:Date.now()};entry.count++;attempts.set(key,entry);if(entry.count>10)return Response.json({error:'Too many attempts. Try again in one minute.'},{status:429});}
 const result=await changeAccess(request,input);const headers:Record<string,string>={'Cache-Control':'no-store'};if(result.token!==undefined)headers['Set-Cookie']=`wt_session=${result.token}; HttpOnly; SameSite=Strict; Path=/api/work-tracker; Max-Age=${result.token?28800:0}`;
 return Response.json({message:result.message}, {headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Account action failed.'},{status:400})}}
