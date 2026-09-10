import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';

const sqlite=new DatabaseSync(':memory:');const objects=new Map();
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args}bind(...args){return new Statement(this.sql,args)}async all(){return {success:true,results:sqlite.prepare(this.sql).all(...this.args)}}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async run(){sqlite.prepare(this.sql).run(...this.args);return {success:true}}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.all());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const files={async put(key,value,options){const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(await new Response(value).arrayBuffer());objects.set(key,{bytes,options});},async get(key){const object=objects.get(key);if(!object)return null;return {body:new Blob([object.bytes]).stream(),httpMetadata:object.options?.httpMetadata,arrayBuffer:async()=>object.bytes.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(object.bytes))};},async delete(key){objects.delete(key)}};
globalThis.testStorageEnv={DB:db,FILES:files,MCCIA_EDITOR_KEY:'test-only-editor-key-not-for-production-12345',MCCIA_EDITOR_NAME:'Verified editor'};
const auth=await import('../app/api/editor-auth.ts');
const intake=await import('../app/api/form-intake/route.ts');
const updates=await import('../app/api/form-intake/[id]/route.ts');
const uploads=await import('../app/api/uploads/route.ts');
const audit=await import('../app/api/audit-log/route.ts');
const privateImage=await import('../app/api/form-intake/[id]/image/route.ts');
const publicImage=await import('../app/api/uploads/[id]/image/route.ts');
const transfer=await import('../app/api/evidence-transfer/route.ts');
const parts=await import('../app/api/evidence-transfer/[id]/route.ts');
const autoPublish=await import('../app/api/form-intake/[id]/auto-publish/route.ts');
const schema=await import('../db/index.ts');
await schema.ensureFormIntakeSchema(db);await schema.ensureUploadsSchema(db);
const origin='http://localhost:3000';const cookie=`mccia_editor=${await auth.loginEditor(globalThis.testStorageEnv.MCCIA_EDITOR_KEY)}`;
const request=(path,method='GET',body,authenticated=true)=>new Request(origin+path,{method,headers:{...(authenticated?{Cookie:cookie,Origin:origin}:{}),...(body&&!(body instanceof FormData)&&!(body instanceof Blob)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData||body instanceof Blob?body:body?JSON.stringify(body):undefined});
const context=id=>({params:Promise.resolve({id})});
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const seed={id:'INT-TEST',sha256:'a'.repeat(64),received_at:'2026-07-12T10:00:00Z',original_filename:'evidence.png',original_key:'private/test',original_content_type:'image/png',original_size:5,publication_date:'2026-07-12',publisher:'Sakal',language:'Marathi',headline:'Public headline',presence:'MCCIA mention',notes:'Private note',status:'Pending OCR'};
function insert(table,row){const keys=Object.keys(row);sqlite.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}
insert('google_form_intake',seed);

test('private reads and every editorial mutation reject anonymous callers',async()=>{
 for(const call of [()=>intake.GET(request('/api/form-intake','GET',null,false)),()=>audit.GET(request('/api/audit-log','GET',null,false)),()=>privateImage.GET(request('/api/form-intake/INT-TEST/image','GET',null,false),context('INT-TEST')),()=>uploads.POST(request('/api/uploads','POST',{reviewed:true},false)),...['Approved','Rejected','In review','Pending OCR'].map(status=>()=>updates.PATCH(request('/api/form-intake/INT-TEST','PATCH',{status,actor:'Forged'},false),context('INT-TEST')))])assert.equal((await call()).status,401);
 assert.equal(sqlite.prepare('SELECT status FROM google_form_intake').get().status,'Pending OCR');
});
test('editor sessions reject modified cookies and cross-site writes',async()=>{
 const forged=new Request(origin+'/api/form-intake',{headers:{Cookie:cookie+'x'}});assert.equal((await auth.authorizeEditor(forged)).authorized,false);
 const cross=new Request(origin+'/api/uploads',{method:'POST',headers:{Cookie:cookie,Origin:'https://other.example'}});assert.equal((await auth.authorizeEditor(cross)).authorized,false);
});
test('review uploads must match their submission hash',async()=>{
 const form=new FormData();form.append('original',new File(['different'],'other.png',{type:'image/png'}));form.append('enhanced',new File(['enhanced'],'enhanced.png',{type:'image/png'}));form.append('metadata',JSON.stringify({intakeId:'INT-TEST',reviewed:true,ocrText:'Readable text',publicationDate:'2026-07-12'}));
 assert.equal((await uploads.POST(request('/api/uploads','POST',form))).status,409);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM clipping_uploads').get().n,0);
});
test('approval derives evidence identity, ignores forged actors, and rejection withdraws it',async()=>{
 assert.equal((await updates.PATCH(request('/api/form-intake/INT-TEST','PATCH',{status:'Approved',approvedRecordId:'OTHER'}),context('INT-TEST'))).status,400);
 const response=await updates.PATCH(request('/api/form-intake/INT-TEST','PATCH',{status:'Approved',actor:'Forged reviewer',ocrText:'Readable text'}),context('INT-TEST'));assert.equal(response.status,200);
 const {record}=await response.json();assert.equal(record.reviewedBy,'Verified editor');
 const published=sqlite.prepare('SELECT * FROM clipping_uploads WHERE id=?').get(record.approvedRecordId);assert.equal(published.original_key,seed.original_key);assert.equal(published.sha256,seed.sha256);
 await files.put(seed.original_key,'bytes',{httpMetadata:{contentType:'image/png'}});
 assert.equal((await publicImage.GET(request('/image'),context(published.id))).status,200);
 assert.equal((await updates.PATCH(request('/update','PATCH',{status:'Rejected'}),context(seed.id))).status,200);
 assert.equal((await publicImage.GET(request('/image'),context(published.id))).status,404);
 assert.deepEqual((await (await uploads.GET(request('/api/uploads'))).json()).records,[]);
 assert.equal(sqlite.prepare('SELECT reviewed FROM clipping_uploads WHERE id=?').get(published.id).reviewed,0);
});
test('pagination retrieves records beyond the old 250 upload limit without omissions',async()=>{
 const template=sqlite.prepare('SELECT * FROM clipping_uploads LIMIT 1').get();
 for(let i=0;i<251;i++)insert('clipping_uploads',{...template,id:`PAGE-${String(i).padStart(4,'0')}`,sha256:String(i).padStart(64,'0'),status:'Published',reviewed:1});
 const ids=[];let cursor;do{const r=await uploads.GET(request('/api/uploads?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));const body=await r.json();assert.equal(r.status,200);ids.push(...body.records.map(row=>row.id));cursor=body.nextCursor;}while(cursor);
 assert.equal(ids.length,251);assert.equal(new Set(ids).size,251);
});
test('multipart transfer rejects missing parts, preserves bytes, and handles the 100 MB boundary',async()=>{
 const bytes=new Uint8Array(transfer.CHUNK_BYTES+17).fill(65),sha=await hash(bytes);
 const descriptor={name:'test.png',type:'image/png',size:bytes.length,sha256:sha};
 const metadata={reviewed:true,publicationDate:'2026-07-12',ocrText:'Reviewed transcription',publisher:'Sakal',language:'Marathi'};
 const response=await transfer.POST(request('/api/evidence-transfer','POST',{mode:'review',files:{original:descriptor,enhanced:descriptor},metadata}));assert.equal(response.status,201);const {id}=await response.json();
 assert.equal((await parts.POST(request('/complete','POST'),context(id))).status,409);
 for(const name of ['original','enhanced'])for(let i=0;i<2;i++){const body=new Blob([bytes.slice(i*transfer.CHUNK_BYTES,(i+1)*transfer.CHUNK_BYTES)]);assert.equal((await parts.PUT(request(`/parts?file=${name}&part=${i}`,'PUT',body),context(id))).status,200);}
 const completed=await parts.POST(request('/complete','POST'),context(id));assert.equal(completed.status,201);const payload=await completed.json();assert.equal(payload.record.sha256,sha);
 assert.equal((await parts.POST(request('/complete','POST'),context(id))).status,201);
 for(const size of [transfer.MAX_FILE_BYTES,transfer.MAX_FILE_BYTES+1]){const f={...descriptor,size};const r=await transfer.POST(request('/start','POST',{mode:'review',files:{original:f,enhanced:f},metadata}));assert.equal(r.status,size===transfer.MAX_FILE_BYTES?201:400);}
});

test('authenticated form upload publishes automatically without editor credentials or private metadata',async()=>{
 globalThis.testStorageEnv.GOOGLE_FORM_INTAKE_SECRET='test-only-automation-secret';
 const make=()=>{const form=new FormData();form.append('file',new File(['automatic newspaper evidence'],'automatic.png',{type:'image/png'}));form.append('metadata',JSON.stringify({publicationDate:'2026-07-12',publisher:'Sakal',headline:'Automatic headline',ocrText:'Newspaper transcription',ocrEngine:'Google Drive OCR',submitterEmail:'private@example.test',driveFileUrl:'https://drive.google.com/private',notes:'Private submission note',status:'Approved',reviewed:true}));return new Request(origin+'/api/form-intake',{method:'POST',headers:{'x-mccia-intake-secret':globalThis.testStorageEnv.GOOGLE_FORM_INTAKE_SECRET},body:form});};
 const first=await intake.POST(make());assert.equal(first.status,201);const body=await first.json();assert.ok(body.publishedId);assert.equal(body.record.status,'Auto-published');
 const raw=sqlite.prepare('SELECT * FROM clipping_uploads WHERE id=?').get(body.publishedId);assert.equal(raw.reviewed,0);assert.equal(raw.status,'Auto-published');assert.equal(raw.ocr_confidence,null);
 const list=await (await uploads.GET(request('/api/uploads?limit=100'))).json();const item=list.records.find(r=>r.id===body.publishedId);assert.ok(item);assert.equal(item.automated,true);assert.equal(item.ocrEngine,'Google Drive OCR');assert.equal(item.enhancedImageUrl,undefined);assert.equal(item.ocrText,'Newspaper transcription');assert.doesNotMatch(JSON.stringify(item),/private@example|drive.google.com\/private|Private submission note/);
 assert.equal((await publicImage.GET(request('/image'),context(body.publishedId))).status,200);
 const second=await (await intake.POST(make())).json();assert.equal(second.publishedId,body.publishedId);assert.equal(second.duplicate,true);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM clipping_uploads WHERE sha256=?').get(body.record.sha256).n,1);
 assert.equal((await updates.PATCH(request('/update','PATCH',{status:'Rejected'}),context(body.record.id))).status,200);
 assert.equal((await (await intake.POST(make())).json()).publishedId,null);
 assert.equal((await publicImage.GET(request('/image'),context(body.publishedId))).status,404);
});

test('automatic publication preserves missing dates and blocks invalid or future dates',async()=>{
 const send=async(date,suffix)=>{const form=new FormData();form.append('file',new File(['date evidence '+suffix],'dated.png',{type:'image/png'}));form.append('metadata',JSON.stringify({publicationDate:date,publisher:'Sakal'}));return intake.POST(new Request(origin+'/api/form-intake',{method:'POST',headers:{'x-mccia-intake-secret':globalThis.testStorageEnv.GOOGLE_FORM_INTAKE_SECRET},body:form}));};
 const missing=await send('','missing');assert.equal(missing.status,201);const value=await missing.json();const stored=sqlite.prepare('SELECT publication_date,reviewed FROM clipping_uploads WHERE id=?').get(value.publishedId);assert.equal(stored.publication_date,'');assert.equal(stored.reviewed,0);
 assert.equal((await send('2050-12-07','future')).status,400);assert.equal((await send('2025-02-30','invalid')).status,400);
 assert.equal((await autoPublish.POST(request('/auto','POST',null,false),context(value.record.id))).status,401);
});

test('automatic retry completes stored evidence without another file transfer',async()=>{
 const row={...seed,id:'INT-RETRY',sha256:'f'.repeat(64),status:'Processing'};insert('google_form_intake',row);
 const response=await autoPublish.POST(new Request(origin+'/auto',{method:'POST',headers:{'x-mccia-intake-secret':globalThis.testStorageEnv.GOOGLE_FORM_INTAKE_SECRET}}),context(row.id));assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.record.status,'Auto-published');assert.equal(sqlite.prepare('SELECT original_key FROM clipping_uploads WHERE id=?').get(payload.publishedId).original_key,row.original_key);
});
