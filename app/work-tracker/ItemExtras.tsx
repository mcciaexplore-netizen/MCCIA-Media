import {useState} from 'react';
import ChoiceField from './ChoiceField';
import {actionsFor,type WorkItem} from './model';
export default function ItemExtras({item,update,act,disabled,role}:{item:WorkItem;update:(key:keyof WorkItem,value:string)=>void;act:(extra:Record<string,unknown>)=>Promise<void>;disabled:boolean;role:string}){
 const [comment,setComment]=useState(''),[name,setName]=useState(''),[url,setUrl]=useState(''),[version,setVersion]=useState(''),[kind,setKind]=useState('Working document');
 const [addingDocument,setAddingDocument]=useState(false);
 const reviewing=['Review','Proofreading','Final approval'].includes(item.stage);
 const field=(key:keyof WorkItem,label:string,type='text')=><label key={key}>{label}<input type={type} value={String(item[key]||'')} onChange={e=>update(key,e.target.value)}/></label>;
 return <>



 {item.category==='Sampada'&&<fieldset><legend>Sampada issue</legend><div className="wt-form-grid">{field('issueMonth','Issue month and year','month')}{field('theme','Theme')}</div></fieldset>}
 {item.category==='Representations'&&<fieldset><legend>Acknowledgement and follow-up</legend><div className="wt-form-grid">{field('acknowledgementDate','Acknowledgement date','date')}{field('followUpDate','Follow-up date','date')}</div></fieldset>}
 {item.category==='Distribution'&&<fieldset><legend>Delivery details</legend><div className="wt-form-grid">{field('quantity','Quantity','number')}{field('deliveryMethod','Delivery method')}{field('receiptDate','Receipt confirmed on','date')}</div></fieldset>}
 <section className="wt-detail-section"><h3>Documents</h3><button type="button" aria-expanded={addingDocument} onClick={()=>setAddingDocument(value=>!value)}>{addingDocument?'Cancel adding document':'Add document'}</button><div className="wt-section-content">{item.workingUrl&&<p><a href={item.workingUrl} target="_blank" rel="noreferrer">Open working document ↗</a></p>}{(item.documents||[]).map(d=><div className="wt-document" key={d.id}><a href={d.url} target="_blank" rel="noreferrer">{d.name} ↗</a><small>{d.kind} · {d.version} · {d.addedBy} · {new Date(d.addedAt).toLocaleDateString('en-IN')}</small></div>)}{addingDocument&&<><div className="wt-form-grid"><label>Document name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Version<input placeholder="v1, v2, final…" value={version} onChange={e=>setVersion(e.target.value)}/></label><ChoiceField label="Document type" value={kind} options={['Working document','Final PDF','Supporting file']} onChange={setKind}/><label>File link<input type="url" value={url} onChange={e=>setUrl(e.target.value)}/></label></div><button type="button" disabled={disabled||!name||!version||!url} onClick={()=>void act({newDocument:{name,url,version,kind},comment})}>Save document version</button></>}</div></section>
 {reviewing&&<fieldset><legend>Review</legend>{field('reviewer','Reviewer')}<label>Comment<textarea rows={2} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Context for this update; required when requesting changes"/></label><div className="wt-actions">{actionsFor(item).map(action=><button type="button" key={action} disabled={disabled||!item.id||(role==='Editor'&&(action.startsWith('Approve')||action==='Request changes'))} onClick={()=>void act({action,comment})}>{action}</button>)}<button type="button" disabled={disabled||!comment.trim()||!item.id} onClick={()=>void act({comment})}>Record comment</button></div><p>Review actions save this item and record your decision.</p></fieldset>}

 </>;
}
