import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {bilingualMatch,safeLink,reportLink,reportRevision,isCoverageArticle,monthRows} from '../app/coverage-intelligence.ts';
import {coverageWorkbook} from '../app/monthly-report.ts';
test('partial names and advertised Marathi aliases match without dropping literal tokens',()=>{for(const q of ['Prashant','प्रशांत गिरबणे','Prashant Girbane'])assert.equal(bilingualMatch('Prashant Girbane at MCCIA',q),true,q);assert.equal(bilingualMatch('MSME support','एमएसएमई'),true);assert.equal(bilingualMatch('PG0012','PG0013'),false)});
test('safe relative evidence links work in readers and exported workbooks',async()=>{assert.equal(safeLink('/api/uploads/AUTO-123/image'),'/api/uploads/AUTO-123/image');assert.equal(reportLink('/api/uploads/AUTO-123/image'),'https://mccia-media.vercel.app/api/uploads/AUTO-123/image');for(const url of ['//evil.test/a','/\\evil.test/a','javascript:alert(1)','data:text/html,x'])assert.equal(safeLink(url),null,url);const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await coverageWorkbook([{id:'A',title:'Headline',date:'2025-01-01',publisher:'Sakal',evidenceImageUrl:'/api/uploads/A/image'}],'test'));assert.equal(book.getWorksheet('Coverage').getCell('J2').value,'https://mccia-media.vercel.app/api/uploads/A/image')});
test('all e-paper dates retain precision and report freshness includes data changes',()=>{const epapers=JSON.parse(fs.readFileSync(new URL('../app/epaper-sources.json',import.meta.url)));assert.equal(epapers.length,64);const monthly=epapers.filter(r=>r.datePrecision==='month');assert.equal(monthly.length,62);for(const r of monthly)assert.ok(monthRows(epapers,r.publicationMonth).some(x=>x.id===r.id));assert.notEqual(reportRevision([{id:'A',title:'Old'}]),reportRevision([{id:'A',title:'Corrected'}]));for(const id of ['PG2527','PG2528','PG2561','PG2562'])assert.equal(isCoverageArticle({id}),false)});
function scriptContext(){const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../google-apps-script/Pipeline.gs',import.meta.url),'utf8'),context);return context}
test('Apps Script spreadsheet sinks neutralize formulas, preserving dates and numbers',()=>{const c=scriptContext();for(const value of ['=IMPORTXML("https://bad.test","x")',' +SUM(A1)','@X','-1+2','\t=NOW()'])assert.equal(c.miSafeCell_(value),"'"+value);assert.equal(c.miSafeCell_(20),20);const date=new Date();assert.equal(c.miSafeCell_(date),date);assert.equal(c.miSafeCell_('मराठी'), 'मराठी')});
test('Drive gateway requires signatures and strips private submission fields',()=>{
 const c=scriptContext(),secret='test-only-secret-long-enough-for-signing';
 c.PropertiesService={getScriptProperties:()=>({getProperty:()=>secret})};c.Utilities={computeHmacSha256Signature:(p,s)=>[...createHmac('sha256',s).update(p).digest()],formatDate:d=>new Date(d).toISOString().slice(0,10)};
 c.ContentService={MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})};
 const row={'Approved record ID':'AUTO-1','Processing status':'Auto-published','Publication date':'2025-01-01','Updated at':'2025-01-01','Publisher':'Sakal','Headline':'Public headline','OCR text':'Readable article','MIME type':'image/png','Drive file ID':'PRIVATE_DRIVE_ID','Submitter email':'private@example.test','Drive file URL':'https://drive.google.com/private','Source URL':'https://drive.google.com/private'};
 c.miSheet_=()=>({});c.miObjects_=()=>[row,{...row,'Approved record ID':'AUTO-2','Processing status':'OCR retry pending'}];
 const payload=JSON.stringify({action:'published',data:{},at:Date.now(),nonce:'unique'}),signature=createHmac('sha256',secret).update(payload).digest('hex');
 assert.equal(c.doPost({postData:{contents:JSON.stringify({payload,signature:'bad'})}}).ok,false);
 const result=c.doPost({postData:{contents:JSON.stringify({payload,signature})}});assert.equal(result.ok,true);assert.equal(result.data.records.length,1);assert.equal(result.data.records[0].ocrText,'Readable article');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DRIVE_ID|private@example|drive.google/);
});

test('Apps Script OCR uses supplied language hints and flags empty or failed OCR',()=>{
 const c=scriptContext(),seen=[];c.MimeType={PDF:'application/pdf'};c.Utilities={sleep:()=>{}};c.miError_=()=>{};c.DriveApp={getFileById:()=>({setTrashed:()=>{}})};
 c.Drive={Files:{create:(_meta,_blob,options)=>{seen.push(options);return {id:'temporary'}}}};let content='Readable clipping';c.DocumentApp={openById:()=>({getBody:()=>({getText:()=>content})})};const file={getName:()=> 'clip.png',getBlob:()=>({}),getId:()=> 'private'};
 for(const [language,hint] of [['Marathi','mr'],['Hindi','hi'],['English','en'],['',undefined]]){assert.equal(c.miOcr_(file,'image/png',language).text,content);assert.equal(seen.at(-1).ocrLanguage,hint)}
 content='';assert.match(c.miOcr_(file,'image/png','').error,/no readable text/);c.Drive.Files.create=()=>{throw new Error('OCR quota exceeded')};assert.equal(c.miOcr_(file,'image/png','').error,'OCR quota exceeded');
});
