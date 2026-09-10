import { authorizeEditor, editorConfigured, loginEditor, sameOrigin, sessionCookie } from '../editor-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){const auth=await authorizeEditor(request);return Response.json({authenticated:auth.authorized,actor:auth.actor,configured:editorConfigured()},{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Sign in from this website.'},{status:403});
  if(!editorConfigured())return Response.json({error:'Editor sign-in has not been configured for this deployment.'},{status:503});
  try{const body=await request.json() as {key?:unknown};const token=await loginEditor(String(body.key||'').slice(0,512));
    if(!token)return Response.json({error:'The editor access key is invalid.'},{status:401});
    return Response.json({authenticated:true},{headers:{'Set-Cookie':sessionCookie(token,new URL(request.url).protocol==='https:'),'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Invalid sign-in request.'},{status:400});}
}
export async function DELETE(request:Request){if(!sameOrigin(request))return Response.json({error:'Sign out from this website.'},{status:403});return Response.json({authenticated:false},{headers:{'Set-Cookie':sessionCookie('',new URL(request.url).protocol==='https:'),'Cache-Control':'private, no-store'}});}
