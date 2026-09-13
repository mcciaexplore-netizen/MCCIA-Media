import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export type Role='Administrator'|'Reviewer'|'Editor'|'Viewer';
export type Identity={name:string;role:Role;id:string};
type User=Identity&{salt:string;hash:string};
type Access={users:User[];sessions:{hash:string;userId:string;expires:number}[]};
const directory=join(process.cwd(),'.local-work-tracker'),file=join(directory,'access.json');
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
async function read():Promise<Access>{try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {users:[],sessions:[]};throw e}}
async function write(data:Access){await mkdir(directory,{recursive:true});const temp=file+'.tmp';await writeFile(temp,JSON.stringify(data),'utf8');await rename(temp,file)}
let queue:Promise<unknown>=Promise.resolve();
function transact<T>(fn:()=>Promise<T>):Promise<T>{const result=queue.then(fn);queue=result.catch(()=>{});return result}
export async function identity(request:Request):Promise<Identity|null>{const data=await read();if(!data.users.length)return {id:'local-owner',name:process.env.USERNAME||'Local owner',role:'Administrator'};const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('wt_session='))?.slice(11)||'';const session=data.sessions.find(x=>x.hash===digest(token)&&x.expires>Date.now());const user=data.users.find(x=>x.id===session?.userId);return user?{id:user.id,name:user.name,role:user.role}:null}
export async function accessStatus(request:Request){const data=await read(),user=await identity(request);return {user,configured:data.users.length>0,users:user?.role==='Administrator'?data.users.map(({id,name,role})=>({id,name,role})):[]}}
export async function changeAccess(request:Request,input:Record<string,unknown>){return transact(async()=>{
 const data=await read(),current=await identity(request),action=input.action;
 if(action==='logout'){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('wt_session='))?.slice(11)||'';data.sessions=data.sessions.filter(x=>x.hash!==digest(token));await write(data);return {token:'',message:'Signed out'};}
 if(action==='setup'||action==='add'){
  if(action==='setup'&&data.users.length)throw Error('Team sign-in is already configured.');
  if(action==='add'&&current?.role!=='Administrator')throw Error('Administrator access required.');
  const name=String(input.name||'').trim(),password=String(input.password||''),role=(action==='setup'?'Administrator':input.role) as Role;
  if(!name||name.length>100||password.length<12||password.length>200)throw Error('Enter a name and a password of 12–200 characters.');
  if(!['Administrator','Reviewer','Editor','Viewer'].includes(role))throw Error('Choose a valid role.');
  if(data.users.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw Error('This team member already exists.');
  const salt=Buffer.from(randomBytes(16)).toString('hex');data.users.push({id:Buffer.from(randomBytes(16)).toString('hex'),name,role,salt,hash:Buffer.from(scryptSync(password,salt,64)).toString('hex')});await write(data);
  return {message:'Team member created. Sign in with the new account.'};
 }
 if(action==='login'){
  const user=data.users.find(x=>x.name.toLowerCase()===String(input.name||'').trim().toLowerCase());const password=String(input.password||'');
  if(password.length>200||!user||!timingSafeEqual(Buffer.from(user.hash,'hex'),scryptSync(password,user.salt,64)))throw Error('Name or password is incorrect.');
  const token=Buffer.from(randomBytes(32)).toString('hex');data.sessions=data.sessions.filter(x=>x.expires>Date.now());data.sessions.push({hash:digest(token),userId:user.id,expires:Date.now()+8*60*60*1000});await write(data);return {token,message:'Signed in'};
 }
 throw Error('Unknown account action.');
})}
