import { env } from 'cloudflare:workers';

const COOKIE = 'mccia_editor';
const SESSION_SECONDS = 8 * 60 * 60;
const config = (name: string) => (env as unknown as Record<string, string | undefined>)[name]?.trim() || process.env[name]?.trim() || '';
const encoder = new TextEncoder();
const hex = (data: ArrayBuffer) => [...new Uint8Array(data)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function constantTimeEqual(a: string, b: string) {
  const [left,right]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
  const l=new Uint8Array(left),r=new Uint8Array(right);let difference=0;for(let i=0;i<l.length;i++)difference|=l[i]^r[i];return difference===0;
}
async function sign(value: string) {
  const secret=config('MCCIA_EDITOR_KEY');if(secret.length<32)return '';
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
export function editorConfigured(){return config('MCCIA_EDITOR_KEY').length>=32;}
export function sameOrigin(request: Request) {return request.headers.get('origin')===new URL(request.url).origin;}
export async function loginEditor(key: string) {
  if(!editorConfigured()||!key||!await constantTimeEqual(key,config('MCCIA_EDITOR_KEY')))return null;
  const expires=String(Math.floor(Date.now()/1000)+SESSION_SECONDS);
  return `${expires}.${await sign(expires)}`;
}
export function sessionCookie(token: string, secure: boolean) {return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?SESSION_SECONDS:0}${secure?'; Secure':''}`;}
export async function authorizeEditor(request: Request) {
  const denied={authorized:false,actor:''};
  const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1)||'';
  const [expires,signature]=token.split('.');
  if(expires&&signature&&/^\d+$/.test(expires)&&Number(expires)>Date.now()/1000&&Number(expires)<=Date.now()/1000+SESSION_SECONDS+60){
    const expected=await sign(expires);
    if(expected&&await constantTimeEqual(signature,expected)){
      if(!['GET','HEAD'].includes(request.method)&&!sameOrigin(request))return denied;
      return {authorized:true,actor:config('MCCIA_EDITOR_NAME')||'Authenticated MCCIA editor'};
    }
  }
  const automationSecret=config('MCCIA_EDITOR_AUTOMATION_SECRET');
  const supplied=request.headers.get('x-mccia-editor-secret')||'';
  if(automationSecret.length>=32&&supplied&&await constantTimeEqual(supplied,automationSecret))return {authorized:true,actor:'Authorized editorial automation'};
  return denied;
}
export const editorRequired=()=>Response.json({error:'Sign in as an editor to access submissions and review actions.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
