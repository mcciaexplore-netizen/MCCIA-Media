import { validPublicationDate } from './media-metadata.ts';

export type CoverageArticle = {id:string;title:string;publisher:string;date:string;year?:number|null;publicationMonth?:string;datePrecision?:string;topic?:string;language?:string;presence?:string;description?:string;status?:string;url?:string|null;evidenceImageUrl?:string|null;googleNewsFetchedAt?:string;firstSeenAt?:string;discoveredAt?:string};
const aliases = [
  ['prashant girbane','prashant girbani','prashanth girbane','प्रशांत गिरबने','प्रशांत गिरबाणे','प्रशांत गिरभने'],
  ['mccia','m c c i a','mahratta chamber','maratha chamber','एमसीसीआयए','एमसीसीआईए','मराठा चेंबर'],
  ['msme','msmes','सूक्ष्म लघु मध्यम उद्योग','लघु उद्योग'],
  ['semiconductor','semiconductors','सेमीकंडक्टर','सेमिकंडक्टर'],
  ['employment','jobs','रोजगार'],['exports','export','निर्यात'],
  ['industry','industrial','उद्योग','औद्योगिक'],['budget','अर्थसंकल्प'],
  ['sakal','सकाळ'],['loksatta','लोकसत्ता'],['lokmat','लोकमत'],
  ['maharashtra times','महाराष्ट्र टाइम्स'],['pudhari','पुढारी'],
];
export function searchNormalize(text:string) {
  return text.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[०-९]/g,n=>String(n.charCodeAt(0)-0x0966)).replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
}
function aliasNormalize(text:string) {
  let result=` ${searchNormalize(text)} `;
  for(const [index,group] of aliases.entries()) for(const phrase of [...group].sort((a,b)=>b.length-a.length)) result=result.split(` ${searchNormalize(phrase)} `).join(` alias${index} `);
  return result.trim();
}
function nearWord(a:string,b:string) {
  if(a===b)return true;
  if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
  return edits+(a.length-i)+(b.length-j)<=1;
}
export function bilingualMatch(text:string,query:string) {
  if(!query.trim())return true;
  const haystack=aliasNormalize(text),needle=aliasNormalize(query);
  if(haystack.includes(needle))return true;
  const words=haystack.split(' ');
  return needle.split(' ').every(token=>words.some(word=>word===token||(!/\d/.test(token)&&nearWord(token,word))));
}
export function safeLink(value?:string|null){try{const u=new URL(value||'');return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function canonicalUrl(value?:string|null){const link=safeLink(value);if(!link)return '';const u=new URL(link);for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(key))u.searchParams.delete(key);u.hash='';if(u.pathname==='/'&&!u.search)return '';return u.href.replace(/\/$/,'');}
const stopwords=new Set('the a an and or of to in for on at by with from is are was mccia pune prashant girbane'.split(' '));
function titleTokens(value:string){return new Set(searchNormalize(value).split(' ').filter(t=>t.length>2&&!stopwords.has(t)));}
export function relatedStory(a:CoverageArticle,b:CoverageArticle){
  const url=canonicalUrl(a.url);if(url&&url===canonicalUrl(b.url))return true;
  if(!validPublicationDate(a.date)||!validPublicationDate(b.date)||Math.abs(Date.parse(a.date)-Date.parse(b.date))>3*86400000)return false;
  const left=titleTokens(a.title),right=titleTokens(b.title);
  if(left.size<4||right.size<4)return false;
  const numbers=(s:string)=>searchNormalize(s).match(/\d+/g)?.sort().join(',')||'';
  if(numbers(a.title)!==numbers(b.title))return false;
  const intersection=[...left].filter(t=>right.has(t)).length;
  return intersection/(left.size+right.size-intersection)>=0.7 && intersection/Math.min(left.size,right.size)>=0.85;
}
export function groupStories<T extends CoverageArticle>(records:T[]) {
  const groups:{id:string;articles:T[]}[]=[];
  const byDay=new Map<number,typeof groups>(),byUrl=new Map<string,typeof groups[number]>();
  // Compare with each group's representative to avoid chains of weak matches.
  for(const record of [...records].sort((a,b)=>a.id.localeCompare(b.id))){
    const day=validPublicationDate(record.date)?Math.floor(Date.parse(record.date)/86400000):NaN,url=canonicalUrl(record.url);
    const candidates=Number.isFinite(day)?[-3,-2,-1,0,1,2,3].flatMap(offset=>byDay.get(day+offset)||[]):[];
    let group=(url?byUrl.get(url):undefined)||candidates.find(g=>relatedStory(g.articles[0],record));
    if(group)group.articles.push(record);else{group={id:record.id,articles:[record]};groups.push(group);if(Number.isFinite(day))byDay.set(day,[...(byDay.get(day)||[]),group]);}
    if(url)byUrl.set(url,group);
  }
  return groups;
}
export function indiaDay(value: string | Date=new Date()) {const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function discoveredDay(item:CoverageArticle){const timestamp=item.firstSeenAt||item.googleNewsFetchedAt||item.discoveredAt;return timestamp?indiaDay(timestamp):'';}
export function publicationMonth(item:CoverageArticle){return item.datePrecision==='month'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item.publicationMonth||'')?item.publicationMonth!:validPublicationDate(item.date)?item.date.slice(0,7):'';}
export function monthRows<T extends CoverageArticle>(records:T[],month:string){return records.filter(item=>publicationMonth(item)===month);}
export function counts(values:string[]){const map=new Map<string,number>();for(const value of values)map.set(value,(map.get(value)||0)+1);return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));}
export function previousMonth(month:string){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m-2,1)).toISOString().slice(0,7);}
