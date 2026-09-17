"use client";
import {useEffect,useState} from 'react';
import {categories,type PublicWorkItem} from './model';
import './tracker.css';
export default function PublicTracker(){
 const [items,setItems]=useState<PublicWorkItem[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[category,setCategory]=useState('All');
 useEffect(()=>{fetch('/api/work-tracker/public',{cache:'no-store'}).then(async r=>{const data=await r.json() as {error?:string;items?:PublicWorkItem[]};if(!r.ok)throw Error(data.error||'Tracker unavailable');if(!Array.isArray(data.items))throw Error('The tracker returned an invalid response.');setItems(data.items)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const visible=items.filter(i=>category==='All'||i.category===category);
 return <div className="wt-root"><header className="wt-header"><a href="/"><img src="/mccia-logo.png" alt="MCCIA" width="140"/></a><nav aria-label="Tracker navigation"><a href="/">Media archive</a></nav><span>Public view</span></header><main className="wt-main"><h1>Work tracker</h1><p>Approved publication updates. Private drafts and internal notes are not shown.</p><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>{loading?<p role="status">Loading approved items...</p>:error?<p role="alert">{error}</p>:visible.length?<div className="wt-table-wrap"><table className="wt-table"><thead><tr><th>Title</th><th>Category</th><th>Stage</th><th>Publication date</th><th>Status</th></tr></thead><tbody>{visible.map(i=><tr key={i.id}><td>{i.title}</td><td>{i.category}</td><td>{i.stage}</td><td>{i.publicationDate||'Not set'}</td><td>{i.completed?'Completed':'In progress'}</td></tr>)}</tbody></table></div>:<p>No approved items have been published{category==='All'?'':' in this category'} yet.</p>}</main></div>
}
