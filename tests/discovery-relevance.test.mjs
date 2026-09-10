import test from 'node:test';
import assert from 'node:assert/strict';
import {relevantHeadline} from '../app/discovery-relevance.ts';
import {topicLabel} from '../app/topic-labels.ts';
test('only explicit entity mentions qualify an automatic headline',()=>{
 for(const title of ['MCCIA opens helpline','Prashant Girbane on exports','प्रशांत गिरबणे यांचे मार्गदर्शन'])assert.equal(relevantHeadline(title),true);
 for(const title of ['Homeless man steals seven seized pistols','Pune MSMEs expand','NotMCCIA item'])assert.equal(relevantHeadline(title),false);
});
test('topics use headline evidence and preserve specific assigned labels',()=>{
 assert.equal(topicLabel('MCCIA coverage','New export opportunities'),'Exports & trade');
 assert.equal(topicLabel('MCCIA coverage','कौशल्य प्रशिक्षण सुरू'),'Skills & education');
 assert.equal(topicLabel('MCCIA coverage','A local meeting'),'Topic not assigned');
 assert.equal(topicLabel('Cybersecurity','MCCIA event'),'Cybersecurity');
});
