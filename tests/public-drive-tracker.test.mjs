import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../google-apps-script/Pipeline.gs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function miTrackerSnapshot_'));
function harness(){const rows=[];const sheet={appendRow(v){rows.push({ID:v[0],Snapshot:v[1],Revision:v[2]})},getRange(n){return {setValues(v){rows[n-2]={ID:v[0][0],Snapshot:v[0][1],Revision:v[0][2]}}}}};const ctx=vm.createContext({miGatewaySheet_:()=>sheet,miObjects_:()=>rows,miSafeRow_:v=>v,miSafeRows_:v=>v,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});vm.runInContext(code,ctx);return ctx;}
const snapshot={id:'WORK-ABC',title:'Approved title',category:'Publications',stage:'Review',publicationDate:'',completed:false,notes:'PRIVATE',owner:'PRIVATE'};
test('Drive tracker strips private fields, supports retry, rejects stale writes and withdraws',()=>{const h=harness();h.miTrackerPublish_({id:snapshot.id,snapshot,revision:2});h.miTrackerPublish_({id:snapshot.id,snapshot,revision:2});const items=h.miTrackerPublished_().items;assert.equal(items.length,1);assert.equal(items[0].notes,undefined);assert.equal(items[0].owner,undefined);assert.throws(()=>h.miTrackerPublish_({id:snapshot.id,snapshot,revision:1}));assert.throws(()=>h.miTrackerPublish_({id:snapshot.id,snapshot:{...snapshot,title:'Different'},revision:2}));h.miTrackerPublish_({id:snapshot.id,snapshot:null,revision:3});assert.equal(h.miTrackerPublished_().items.length,0);assert.throws(()=>h.miTrackerPublish_({id:snapshot.id,snapshot,revision:2}));});
test('Drive tracker rejects malformed snapshots',()=>{const h=harness();assert.throws(()=>h.miTrackerPublish_({id:snapshot.id,snapshot:{...snapshot,completed:'yes'},revision:1}));assert.throws(()=>h.miTrackerPublish_({id:snapshot.id,snapshot:{...snapshot,id:'OTHER'},revision:1}));assert.equal(h.miTrackerPublished_().items.length,0);});
