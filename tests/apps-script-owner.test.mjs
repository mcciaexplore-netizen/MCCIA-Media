import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('Apps Script setup requires the Newsclipping owner account',()=>{
 const source=fs.readFileSync(new URL('../google-apps-script/Pipeline.gs',import.meta.url),'utf8');
 const context=vm.createContext({Session:{getEffectiveUser:()=>({getEmail:()=> 'mcciaexplore@gmail.com'})}});
 vm.runInContext(source,context);
 assert.throws(()=>context.setupMcciaMediaIntelligence(),/Sign in as mccianewsclipping@gmail.com/);
});
