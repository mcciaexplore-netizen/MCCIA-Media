import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const sqlite=new DatabaseSync(':memory:');
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Statement(this.sql,args)}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:r.changes}}}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows}catch(e){sqlite.exec('ROLLBACK');throw e}}};
globalThis.testStorageEnv={DB:db,FILES:{},MCCIA_EDITOR_KEY:'test-only-editor-key-for-corrections-123456',MCCIA_EDITOR_NAME:'Authenticated team member'};
const auth=await import('../app/api/editor-auth.ts'),route=await import('../app/api/corrections/route.ts');
const origin='http://localhost:3000',cookie=`mccia_editor=${await auth.loginEditor(globalThis.testStorageEnv.MCCIA_EDITOR_KEY)}`;
const req=(body,authenticated=true)=>new Request(origin+'/api/corrections',{method:'POST',headers:authenticated?{cookie,origin,'content-type':'application/json'}:{},body:JSON.stringify(body)});
test('corrections require editor access, validate dates, retain audit and reject stale versions',async()=>{
 const value={id:'PG0027',title:'Corrected test headline',date:'2025-07-12',reason:'Checked against the source clipping',actor:'Forged actor'};
 assert.equal((await route.POST(req(value,false))).status,401);
 assert.equal((await route.POST(req({...value,date:'2099-01-01'}))).status,400);
 assert.equal((await route.POST(req({...value,id:'UNKNOWN'}))).status,400);
 const saved=await route.POST(req(value));assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.patch.year,2025);
 assert.equal(sqlite.prepare('SELECT actor FROM metadata_correction_audit').get().actor,'Authenticated team member');
 assert.equal((await route.POST(req(value))).status,409);
 const publicView=await (await route.GET(new Request(origin+'/api/corrections'))).json();assert.equal(publicView.records[0].patch.title,value.title);assert.equal(JSON.stringify(publicView).includes('Checked against'),false);
});
