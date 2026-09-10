import test from 'node:test';
import assert from 'node:assert/strict';
import {bilingualMatch,groupStories,relatedStory,discoveredDay,monthRows,safeLink} from '../app/coverage-intelligence.ts';
import {monthlyWorkbook} from '../app/monthly-report.ts';
const article=(id,title,date='2026-08-15',extra={})=>({id,title,date,publisher:id,language:'Marathi',...extra});
test('English and Marathi aliases, spelling tolerance and exact numeric IDs',()=>{
 assert.ok(bilingualMatch('प्रशांत गिरबाणे यांनी उद्योग विषयावर चर्चा केली','Prashant Girbane'));
 assert.ok(bilingualMatch('MCCIA exports report','एमसीसीआयए निर्यात'));
 assert.ok(bilingualMatch('manufacturing industry','manufacturin'));
 assert.ok(bilingualMatch('PG0193 Maharashtra Times','pg0193'));
 assert.equal(bilingualMatch('PG0194 Maharashtra Times','PG0193'),false);
 assert.equal(bilingualMatch('supply chain news','Prashant Girbane'),false);
});
test('story suggestions keep publisher coverage and reject weak or distant matches',()=>{
 const a=article('a','India semiconductor manufacturing investment creates 5000 jobs');
 const b=article('b','India semiconductor manufacturing investment creates 5000 new jobs');
 assert.ok(relatedStory(a,b));
 assert.equal(relatedStory(a,{...b,date:'2026-09-01'}),false);
 assert.equal(relatedStory(a,{...b,title:b.title.replace('5000','6000')}),false);
 assert.equal(relatedStory({...a,url:'https://example.com/'},{...b,title:'Unrelated meeting and trade event',url:'https://example.com/'}),false);
 const groups=groupStories([a,b,article('c','Separate article on education policy')]);
 assert.equal(groups.length,2);assert.equal(groups.flatMap(g=>g.articles).length,3);
});
test('discovery day uses India time and never substitutes publication date',()=>{
 assert.equal(discoveredDay(article('a','headline','2026-08-01',{firstSeenAt:'2026-09-09T20:00:00Z'})),'2026-09-10');
 assert.equal(discoveredDay(article('a','headline')),'');
 assert.equal(monthRows([article('a','headline',''),article('b','headline','2026-08-10'),article('c','issue','',{publicationMonth:'2026-08',datePrecision:'month'})],'2026-08').length,2);
 assert.equal(safeLink('javascript:alert(1)'),null);
});
test('Excel report preserves Marathi and treats formula-like text as text',async()=>{
 const {default:ExcelJS}=await import('exceljs');const buffer=await monthlyWorkbook([article('a','=HYPERLINK("evil")','2026-08-15'),article('b','प्रशांत गिरबाणे','2026-08-16')],'2026-08');
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.getWorksheet('Coverage');
 assert.equal(sheet.getCell('D2').value,'=HYPERLINK("evil")');assert.equal(sheet.getCell('D2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('D3').value,'प्रशांत गिरबाणे');assert.equal(sheet.rowCount,3);
});
