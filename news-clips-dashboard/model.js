import {normalizeRecordMetadata,recordLookup,resolveClippingMetadata,peopleCategory,normalizeLanguage,publicationYear} from './lib/media-metadata.js';
import {normalizeCategories} from './lib/archive-ui.js';
import {isCoverageArticle} from './lib/coverage-intelligence.js';
import {resolveRecordDgEngagementType} from './lib/dg-classification.js';
export function assemble(snapshot){
 const d=snapshot.data, connection=name=>snapshot.connections.find(c=>c.name===name&&c.ok)?.data||[];
 const corrections=new Map(connection('corrections').map(c=>[c.recordId,c.patch]));
 const normalize=r=>normalizeCategories(normalizeRecordMetadata({publisher:"",topic:"",...r}));
 const records=[...new Map([...d.records.filter(isCoverageArticle),...d['google-news-alerts'],...connection('source-monitoring')].map(r=>[r.id,r])).values()].map(r=>normalize({...r,...corrections.get(r.id),kind:'Media record'}));
 const lookup=recordLookup(records),merged=new Map(d.clippings.map(c=>[c.id,c]));
 for(const c of connection('uploads')){for(const [id,old] of merged)if(c.sha256&&old.sha256===c.sha256)merged.delete(id);merged.set(c.id,c);}
 const clippings=[...merged.values()].map(c=>{const patch=corrections.get(c.id)||corrections.get(c.matchedRecordId);return normalize({...resolveClippingMetadata({...c,...patch},lookup.get(c.matchedRecordId)),title:patch?.title||c.correctedHeadline||c.ocrHeadline||'Clipping — headline unavailable',kind:'Unlinked clipping'});});
 const epapers=d['epaper-sources'].map(r=>normalize({...r,...corrections.get(r.id),kind:'E-paper'}));
 const unlinked=clippings.filter(c=>!lookup.has(c.matchedRecordId));
 const rows=[...records,...epapers,...unlinked].map(r=>({...r,year:publicationYear(r),person:peopleCategory(r.presence),language:normalizeLanguage(r.language),dg:resolveRecordDgEngagementType(r)||'Not classified',url:r.url||r.publicSourceUrl}));
 return {rows,records,epapers,clippings,linked:clippings.length-unlinked.length};
}
export function counts(rows,key){const result=new Map();for(const r of rows){const label=String(typeof key==='function'?key(r):r[key]||'Not recorded');result.set(label,(result.get(label)||0)+1);}return [...result].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));}

