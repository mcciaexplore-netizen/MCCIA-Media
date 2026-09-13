import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('local accounts require sign-in after setup and enforce administrator provisioning',async()=>{
 const original=process.cwd(),directory=await mkdtemp(join(tmpdir(),'mccia-access-test-'));
 try{process.chdir(directory);const {identity,changeAccess,accessStatus}=await import('../app/api/work-tracker/access.ts');
 const request=new Request('http://127.0.0.1:3001/api/work-tracker/access');
 assert.equal((await identity(request)).role,'Administrator');
 await changeAccess(request,{action:'setup',name:'Test Admin',password:'test-password-only-1234'});
 assert.equal(await identity(request),null);
 await assert.rejects(()=>changeAccess(request,{action:'setup',name:'Other',password:'test-password-only-1234'}),/already configured/);
 await assert.rejects(()=>changeAccess(request,{action:'add',name:'Viewer',password:'test-password-only-1234',role:'Viewer'}),/Administrator/);
 await assert.rejects(()=>changeAccess(request,{action:'login',name:'Test Admin',password:'wrong'}),/incorrect/);
 const login=await changeAccess(request,{action:'login',name:'Test Admin',password:'test-password-only-1234'});
 const signed=new Request(request,{headers:{cookie:`wt_session=${login.token}`}});
 assert.equal((await identity(signed)).name,'Test Admin');
 await changeAccess(signed,{action:'add',name:'Viewer',password:'test-password-only-1234',role:'Viewer'});
 assert.equal((await accessStatus(signed)).users.length,2);
 assert.equal((await accessStatus(request)).users.length,0);
 const raw=await readFile(join(directory,'.local-work-tracker/access.json'),'utf8');
 assert.ok(!raw.includes('test-password-only-1234'));assert.ok(!raw.includes(login.token));
 await changeAccess(signed,{action:'logout'});assert.equal(await identity(signed),null);
 }finally{process.chdir(original);await rm(directory,{recursive:true,force:true})}
});
