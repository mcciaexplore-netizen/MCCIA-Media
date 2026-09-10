import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {detectMediaMetadata} from '../app/automatic-metadata.js';
import {normalizeRecordMetadata} from '../app/media-metadata.ts';
const examples=[
 ['MCCIA said the exports programme will help manufacturers with training.', 'English','Exports & trade',null],
 ['प्रशांत गिरबणे म्हणाले उद्योगांसाठी निर्यात महत्त्वाची आहे आणि त्यांनी प्रशिक्षण केले', 'Marathi','Exports & trade','Quote given by DG Sir'],
 ['एमसीसीआईए ने कहा कि उद्योग में प्रशिक्षण है और यह विकास के लिए होगा', 'Hindi','Skills & education',null],
 ['MCCIA event with Prashant Girbane and the team', 'English','Topic not assigned',null],
 ['Article by Prashant Girbane on the manufacturing sector and its future', 'English','Manufacturing','Post/article written by DG Sir'],
 ['Conversation with Prashant Girbane on the skills needed for manufacturing', 'English','Skills & education','Conversation with DG Sir'],
 ['SRA 123 @ _', 'Language not recorded','Topic not assigned',null]
];
test('automatic metadata distinguishes languages, topics and attributed DG participation',()=>{
 for(const [text,language,topic,dg] of examples){const actual=detectMediaMetadata(text);assert.equal(actual.language,language,text);assert.equal(actual.topic,topic,text);assert.equal(actual.dgEngagementType,dg,text)}
 assert.equal(detectMediaMetadata('The police director general said the investigation will continue').presence,'Person not recorded');
 assert.match(detectMediaMetadata('Prashant Girbane at MCCIA').presence,/Prashant Girbane/);
});
test('website preserves supplied metadata and uses OCR language rather than an English description',()=>{
 const actual=normalizeRecordMetadata({language:'PDF',ocrText:examples[1][0],description:'The newspaper clipping is in the archive',presence:'Person not recorded',topic:'Topic not assigned'});
 assert.equal(actual.language,'Marathi');assert.equal(actual.topic,'Exports & trade');
 const manual=normalizeRecordMetadata({language:'Hindi',presence:'Named guest',topic:'Custom topic',title:examples[0][0]});
 assert.equal(manual.language,'Hindi');assert.equal(manual.presence,'Named guest');assert.equal(manual.topic,'Custom topic');
});
test('installed script and website share identical detection rules',()=>{
 const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../google-apps-script/Pipeline.gs',import.meta.url),'utf8'),context);
 for(const [text] of examples)assert.deepEqual(JSON.parse(JSON.stringify(context.detectMediaMetadata(text))),detectMediaMetadata(text));
 assert.equal(context.miLanguage_(examples[1][0]),'Marathi');assert.equal(context.miTopic_(examples[0][0]),'Exports & trade');
});
