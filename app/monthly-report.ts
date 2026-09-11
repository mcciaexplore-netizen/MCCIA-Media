import {counts,monthRows,reportLink,type CoverageArticle} from './coverage-intelligence.ts';
import {publicationLabel} from './archive-ui.ts';

export async function monthlyWorkbook(records:CoverageArticle[],month:string){
  return coverageWorkbook(monthRows(records,month),month);
}
export async function coverageWorkbook(rows:CoverageArticle[],label:string){
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();book.creator='MCCIA Media Intelligence';book.created=new Date();
  const summary=book.addWorksheet('Summary');
  summary.columns=[{header:'Metric',key:'metric',width:42},{header:'Value',key:'value',width:28}];
  summary.addRows([['Report selection',label],['Coverage items',rows.length],['Publishers',new Set(rows.map(r=>r.publisher)).size],['Generated at',new Date().toISOString()],['Date scope','Only selected dated coverage'],['Scope','Articles, unlinked clippings and e-paper issues; reference pages excluded'],['Verification','Automatic metadata may contain errors']]);
  const sheet=book.addWorksheet('Coverage',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[['ID',25],['Publication date',26],['Publisher',28],['Headline',75],['Language',24],['People / organisation',34],['Topic',28],['Verification',26],['Source URL',65],['Clipping / evidence',65]].map(([header,width])=>({header:String(header),width:Number(width)}));
  for(const r of rows){const row=sheet.addRow([r.id,publicationLabel(r),r.publisher,r.title,r.language||'Language not recorded',r.presence||'Person not recorded',r.topic||'Topic not assigned',r.status||'Unverified',reportLink(r.url)||'',reportLink(r.evidenceImageUrl)||'']);row.alignment={vertical:'top',wrapText:true};}
  sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:10}};
  const publishers=book.addWorksheet('Publishers');publishers.columns=[{header:'Publisher',width:42},{header:'Coverage items',width:20}];publishers.addRows(counts(rows.map(r=>r.publisher)));
  for(const tab of book.worksheets){tab.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};tab.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244A3C'}};tab.getRow(1).height=26;}
  // Strings remain strings; no cell is constructed as a spreadsheet formula.
  return book.xlsx.writeBuffer();
}
export async function downloadMonthlyWorkbook(records:CoverageArticle[],month:string){
  const buffer=await monthlyWorkbook(records,month),url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download=`MCCIA-coverage-${month}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
