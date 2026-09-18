import {driveConfigured,driveRequest} from '../drive-backend';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export type TeamUser={id:string;email:string;name:string;role:'Administrator'|'Editor'};
const cookieName=()=>process.env.NODE_ENV==='development'?'wt_online':'__Host-wt_online';
export const onlineReady=()=>driveConfigured();
export const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
export function cookieValue(request:Request,name=cookieName()){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
export function sessionCookie(value:string){return `${cookieName()}=${value}; HttpOnly; ${process.env.NODE_ENV==='development'?'':'Secure; '}SameSite=Lax; Path=/; Max-Age=${value?28800:0}`;}
export const clearOnlineSession=()=>sessionCookie('');
export function emailAddress(value:unknown){const email=String(value||'').trim().toLowerCase();if(email.length>100||! /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@mcciapune\.com$/.test(email))throw Error('Use an @mcciapune.com email address.');return email;}
export function passwordRecord(password:unknown){if(typeof password!=='string'||password.length<12||password.length>200)throw Error('Use a separate Work Tracker password of 12–200 characters.');const salt=Buffer.from(randomBytes(16)).toString('hex');return {salt,hash:Buffer.from(scryptSync(password,salt,64)).toString('hex')};}
export function matchesPassword(password:string,salt:string,hash:string){if(password.length>200||! /^[a-f0-9]{32}$/.test(salt)||! /^[a-f0-9]{128}$/.test(hash))return false;return timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(password,salt,64));}
export async function onlineIdentity(request:Request):Promise<TeamUser|null>{const token=cookieValue(request);if(!/^[a-f0-9]{64}$/.test(token))return null;const r=await driveRequest<{user:TeamUser|null}>('trackerAuth',{op:'session',tokenHash:digest(token)});return r.user;}
export async function onlineTeam(){return driveRequest<{members:Record<string,string>}>('trackerAuth',{op:'team'})}
export async function passwordLogin(email:string,password:string){const c=await driveRequest<{salt:string;hash:string}>('trackerAuth',{op:'credentials',email});const valid=matchesPassword(password,c.salt,c.hash);if(!valid)throw Error('Email or password is incorrect.');const token=Buffer.from(randomBytes(32)).toString('hex');await driveRequest('trackerAuth',{op:'login',email,version:c.hash,tokenHash:digest(token)});return token;}
