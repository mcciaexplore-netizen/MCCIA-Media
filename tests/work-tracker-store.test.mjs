import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {blankItem} from '../app/work-tracker/model.ts';

test('local tracker saves across reads, preserves source and rejects stale edits',async()=>{
 const original=process.cwd(),directory=await mkdtemp(join(tmpdir(),'mccia-tracker-test-'));
 try{
  process.chdir(directory);
  const {saveItem,readItems}=await import('../app/api/work-tracker/store.ts');
  const one=await saveItem({...blankItem('Publications'),title:'Test report'});
  assert.equal((await readItems())[0].title,'Test report');
  const changed=await saveItem({...one,owner:'Test owner',source:{sheet:'Injected',row:99,cells:{}},history:[]});
  assert.equal(changed.source,null);
  assert.equal(changed.history.length,2);
  assert.equal(changed.revision,2);
  await assert.rejects(()=>saveItem({...one,title:'Stale overwrite'}),/another window/);
  const edits=await Promise.allSettled([saveItem({...changed,nextAction:'First update'}),saveItem({...changed,nextAction:'Conflicting update'})]);
  assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await readItems())[0].nextAction,'First update');
  const editor={id:'e',name:'Editor One',role:'Editor'},reviewer={id:'r',name:'Reviewer One',role:'Reviewer'};
  let report=(await readItems())[0];
  await assert.rejects(()=>saveItem({...report,title:'Blocked'}, {...editor,role:'Viewer'}),/cannot edit/);
  report=await saveItem({...report,reviewer:'Reviewer One',action:'Send for review',comment:'Ready',actor:'Spoofed'},editor);
  assert.equal(report.stage,'Review');assert.equal(report.history.at(-1).actor,'Editor One');
  await assert.rejects(()=>saveItem({...report,action:'Approve for design'},editor),/reviewer or administrator/);
  await assert.rejects(()=>saveItem({...report,stage:'Design'},editor),/reviewer or administrator/);
  report=await saveItem({...report,action:'Approve for design',comment:'Approved'},reviewer);
  assert.equal(report.history.at(-1).fromStage,'Review');assert.equal(report.stage,'Design');
  report=await saveItem({...report,newDocument:{name:'Draft',version:'v1',kind:'Working document',url:'https://example.com/draft'}},editor);
  const originalDoc=report.documents[0];
  report=await saveItem({...report,documents:[],newDocument:{name:'Draft',version:'v2',kind:'Working document',url:'https://example.com/draft2'}},editor);
  assert.equal(report.documents.length,2);assert.deepEqual(report.documents[0],originalDoc);
  assert.equal(report.documents[1].addedBy,'Editor One');
  await assert.rejects(()=>saveItem({...report,newDocument:{name:'Bad',version:'v3',kind:'Final PDF',url:'javascript:alert(1)'}},editor),/http/);

 }finally{process.chdir(original);await rm(directory,{recursive:true,force:true})}
});
