import type {JsonWebKey} from 'node:crypto';
import {randomBytes,createHash,createPublicKey,verify} from 'node:crypto';
import type {Role} from './access';
const roles:Role[]=['Administrator','Editor','Reviewer','Viewer'];
export function zohoConfig(){
 const client=process.env.ZOHO_CLIENT_ID||'',secret=process.env.ZOHO_CLIENT_SECRET||'',redirect=process.env.ZOHO_REDIRECT_URI||'http://127.0.0.1:3001/api/work-tracker/zoho/callback';
 const host=process.env.ZOHO_ACCOUNTS_URL||'https://accounts.zoho.in';
 if(!['https://accounts.zoho.in','https://accounts.zoho.com','https://accounts.zoho.eu','https://accounts.zoho.com.au'].includes(host))throw Error('Unsupported Zoho data centre.');
 const u=new URL(redirect);if(!['localhost','127.0.0.1'].includes(u.hostname)||u.pathname!=='/api/work-tracker/zoho/callback'||u.search||u.hash)throw Error('Use the local tracker callback URL.');
 const members=JSON.parse(process.env.ZOHO_TEAM_ROLES||'{}') as Record<string,Role>;
 if(!members||typeof members!=='object'||Array.isArray(members)||Object.entries(members).some(([email,role])=>!email.endsWith('@mcciapune.com')||!roles.includes(role)))throw Error('Configure approved MCCIA emails and roles.');
 return {client,secret,redirect,host,members,ready:Boolean(client&&secret&&Object.keys(members).length)};
}
export function zohoReady(){try{return zohoConfig().ready}catch{return false}}
const attempts=new Map<string,{nonce:string;verifier:string;expires:number}>();
export function beginZoho(){for(const [key,value] of attempts)if(value.expires<Date.now())attempts.delete(key);if(attempts.size>200)throw Error('Try signing in later.');const state=Buffer.from(randomBytes(32)).toString('hex'),nonce=Buffer.from(randomBytes(32)).toString('hex'),verifier=Buffer.from(randomBytes(32)).toString('base64url');attempts.set(state,{nonce,verifier,expires:Date.now()+600000});return {state,nonce,challenge:createHash('sha256').update(verifier).digest('base64url')};}
export function consumeZoho(state:string,cookie:string){if(!state||state!==cookie)throw Error('Sign-in expired. Please try again.');const flow=attempts.get(state);attempts.delete(state);if(!flow||flow.expires<Date.now())throw Error('Sign-in expired. Please try again.');return flow;}
export function verifyZohoToken(token:string,keys:JsonWebKey[],client:string,issuer:string,nonce:string){
 const pieces=token.split('.');if(pieces.length!==3)throw Error('Invalid identity token.');const header=JSON.parse(Buffer.from(pieces[0],'base64url').toString());
 if(!['RS256','RS384'].includes(header.alg))throw Error('Invalid signature algorithm.');
 const key=keys.find(k=>(k as JsonWebKey&{kid?:string}).kid===header.kid&&k.kty==='RSA');if(!key)throw Error('Signing key unavailable.');
 if(!verify(header.alg==='RS256'?'RSA-SHA256':'RSA-SHA384',Buffer.from(pieces.slice(0,2).join('.')),createPublicKey({key,format:'jwk'}),Buffer.from(pieces[2],'base64url')))throw Error('Invalid identity signature.');
 const c=JSON.parse(Buffer.from(pieces[1],'base64url').toString()),now=Date.now()/1000;
 if(c.iss!==issuer||c.aud!==client||(c.azp&&c.azp!==client)||typeof c.exp!=='number'||c.exp<=now||typeof c.iat!=='number'||c.iat>now+60||c.nonce!==nonce||c.email_verified!==true||typeof c.sub!=='string'||!c.sub||typeof c.email!=='string')throw Error('Identity could not be verified.');
 return {subject:issuer+'|'+c.sub,email:c.email.toLowerCase(),name:String(c.name||c.email).slice(0,100)};
}
