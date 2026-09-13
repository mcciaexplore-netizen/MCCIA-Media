import {readItems,saveItem,localRequest} from './store';
import {identity} from './access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!localRequest(request))return new Response('Not found',{status:404});
 try{const user=await identity(request);if(!user)return Response.json({error:'Sign in to access team work.'},{status:401});return Response.json({items:await readItems(),user},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'The local tracker could not be read. Your saved file has not been replaced.'},{status:503})}
}
export async function POST(request:Request){
 if(!localRequest(request))return new Response('Not found',{status:404});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
 try{const user=await identity(request);if(!user)return Response.json({error:'Sign in to edit team work.'},{status:401});const text=await request.text();if(text.length>100000)return Response.json({error:'Item is too large.'},{status:413});const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid item.');return Response.json({item:await saveItem(data,user)},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not save item.'},{status:400})}
}
