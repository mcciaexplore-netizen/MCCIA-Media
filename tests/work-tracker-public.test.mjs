import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {blankItem,approvedPublicItems} from '../app/work-tracker/model.ts';
test('public snapshots require editor approval, exclude private fields, and preserve drafts',async()=>{
 const original=process.cwd(),dir=await mkdtemp(join(tmpdir(),'mccia-public-'));
 try{process.chdir(dir);const {saveItem,readItems}=await import('../app/api/work-tracker/store.ts');
 const editor={id:'editor',name:'Test Editor',role:'Editor'};
 let item=await saveItem({...blankItem('Publications'),title:'Report',notes:'PRIVATE',owner:'PRIVATE OWNER',publicApprovedAt:'forged',publicSnapshot:{title:'forged'}},editor);
 assert.deepEqual(approvedPublicItems(await readItems()),[]);
 await assert.rejects(()=>saveItem({...item,publication:'publish'},editor),/Confirm/);
 await assert.rejects(()=>saveItem({...item,publication:'publish',confirmPublic:true},{...editor,role:'Viewer'}));
 await assert.rejects(()=>saveItem({...item,publication:'publish',confirmPublic:true},{...editor,role:'Reviewer'}),/editor or administrator/);
 item=await saveItem({...item,publication:'publish',confirmPublic:true},editor);
 const published=approvedPublicItems(await readItems());assert.equal(published.length,1);
 assert.deepEqual(Object.keys(published[0]).sort(),['id','title','category','stage','publicationDate','completed'].sort());
 assert.equal(JSON.stringify(published).includes('PRIVATE'),false);
 item=await saveItem({...item,title:'Unapproved edit'},editor);assert.equal(approvedPublicItems(await readItems())[0].title,'Report');
 item=await saveItem({...item,publication:'publish',confirmPublic:true},editor);assert.equal(approvedPublicItems(await readItems())[0].title,'Unapproved edit');
 item=await saveItem({...item,publication:'unpublish'},editor);assert.deepEqual(approvedPublicItems(await readItems()),[]);assert.equal(item.notes,'PRIVATE');assert.equal(item.publicApprovedAt,undefined);
 }finally{process.chdir(original);await rm(dir,{recursive:true,force:true})}
});
