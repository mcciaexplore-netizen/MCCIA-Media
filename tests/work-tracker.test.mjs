import test from 'node:test';
import assert from 'node:assert/strict';
import {blankItem,validateItem,overdue,complete} from '../app/work-tracker/model.ts';
import {localRequest} from '../app/api/work-tracker/store.ts';

test('publication completion requires explicit release decisions and a published link',()=>{
 const item={...blankItem('Publications'),title:'Test report',stage:'Completed'};
 assert.throws(()=>validateItem(item),/release activities/);
 assert.throws(()=>validateItem({...item,printStatus:'Done',websiteStatus:'Done',distributionStatus:'Not required'}),/published link/);
 assert.equal(complete(validateItem({...item,printStatus:'Done',websiteStatus:'Not required',distributionStatus:'Not required'})),true);
});
test('tracker rejects impossible dates, executable URLs and mismatched stages',()=>{
 const item={...blankItem('Publications'),title:'Test report'};
 assert.throws(()=>validateItem({...item,dueDate:'2026-02-30'}),/dates/);
 assert.throws(()=>validateItem({...item,workingUrl:'javascript:alert(1)'}),/links/);
 assert.throws(()=>validateItem({...item,stage:'Acknowledged'}),/stage/);
 assert.throws(()=>validateItem({...item,title:'   '}),/title/);
 assert.equal(validateItem({...item,dueDate:'2026-09-15'}).dueDate,'2026-09-15');
});
test('overdue excludes completed, on-hold and undated items',()=>{
 const item={...blankItem('Publications'),title:'Report',dueDate:'2026-09-10'};
 assert.equal(overdue(item,'2026-09-11'),true);
 for(const patch of [{stage:'Completed'},{stage:'On hold'},{dueDate:''},{dueDate:'2026-09-11'}])assert.equal(overdue({...item,...patch},'2026-09-11'),false);
});
test('local tracker blocks production, non-local hosts and cross-origin requests',()=>{
 const original=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='development';
  assert.equal(localRequest(new Request('http://127.0.0.1:3001/api/work-tracker')),true);
  assert.equal(localRequest(new Request('http://localhost:3001/api/work-tracker',{headers:{host:'127.0.0.1:3001',origin:'http://127.0.0.1:3001','sec-fetch-site':'same-origin'}})),true);
  assert.equal(localRequest(new Request('http://localhost:3001/api/work-tracker',{headers:{host:'example.com',origin:'http://example.com'}})),false);
  assert.equal(localRequest(new Request('https://example.com/api/work-tracker')),false);
  assert.equal(localRequest(new Request('http://127.0.0.1:3001/api/work-tracker',{headers:{origin:'https://example.com'}})),false);
  process.env.NODE_ENV='production';
  assert.equal(localRequest(new Request('http://127.0.0.1:3001/api/work-tracker')),false);
 }finally{process.env.NODE_ENV=original}
});


test('attention includes missing dates, upcoming reviews and follow-ups',async()=>{
 const {attentionReasons}=await import('../app/work-tracker/model.ts');
 const item={...blankItem('Representations'),stage:'Review',followUpDate:'2026-09-10'};
 assert.deepEqual(attentionReasons(item,'2026-09-11'),['No deadline','Pending review','Unassigned','Follow-up due']);
 assert.ok(attentionReasons({...item,dueDate:'2026-09-18'},'2026-09-11').includes('Due this week'));
 assert.deepEqual(attentionReasons({...item,stage:'Closed'},'2026-09-11'),[]);
});

test('workflow validates reviewer, changes comments and release evidence',async()=>{
 const {applyAction}=await import('../app/work-tracker/model.ts');
 const draft={...blankItem('Publications'),title:'Report'};
 assert.throws(()=>applyAction(draft,'Send for review',''),/reviewer/);
 const review=applyAction({...draft,reviewer:'Reviewer'},'Send for review','Ready');
 assert.equal(review.stage,'Review');
 assert.throws(()=>applyAction(review,'Request changes',''),/Explain/);
 assert.equal(applyAction(review,'Approve for design','Approved').stage,'Design');
 assert.throws(()=>applyAction(draft,'Mark printed',''),/not available/);
 assert.throws(()=>applyAction({...blankItem('Distribution'),stage:'Sent'},'Confirm delivery',''),/recipient/);
});

test('category details validate dates, month, quantity and source resolution',()=>{
 assert.throws(()=>validateItem({...blankItem('Sampada'),title:'Issue',issueMonth:'2026-13'}),/month/);
 assert.throws(()=>validateItem({...blankItem('Distribution'),title:'Delivery',quantity:'-1'}),/Quantity/);
 assert.throws(()=>validateItem({...blankItem('Representations'),title:'Letter',followUpDate:'2026-02-30'}),/calendar/);
 const previous={...blankItem('Publications'),title:'Import',source:{sheet:'Publications',row:2,cells:{A:'Yes'}}};
 assert.throws(()=>validateItem({...previous,sourceConfirmed:true},previous),/review note/);
 assert.equal(validateItem({...previous,sourceConfirmed:true,resolutionNote:'Owner confirmed the original status.'},previous).source.cells.A,'Yes');
});
