'use client';
import {useSyncExternalStore,useState} from 'react';
const key='mccia-saved-searches-v1';
const presets=['Prashant Girbane','MSME','exports','manufacturing','skills'];
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('saved-searches-change',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('saved-searches-change',callback)}}
function snapshot(){try{return localStorage.getItem(key)||'[]'}catch{return '[]'}}
export default function SavedSearches({query,onSelect}:{query:string;onSelect:(query:string)=>void}){
 const raw=useSyncExternalStore(subscribe,snapshot,()=> '[]'),[message,setMessage]=useState('');
 let saved:string[]=[];try{const value=JSON.parse(raw);if(Array.isArray(value))saved=value.filter((v:unknown)=>typeof v==='string'&&v.length<=160).slice(0,20)}catch{/* Ignore corrupt local preferences. */}
 function update(next:string[]){try{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event('saved-searches-change'));setMessage('Saved on this browser.')}catch{setMessage('Browser storage is unavailable. This search was not saved.')}}
 return <section className="saved-searches" aria-label="Saved searches"><strong>Quick searches</strong><div>{presets.map(value=><button key={value} onClick={()=>onSelect(value)}>{value}</button>)}</div><details><summary>My saved searches ({saved.length})</summary><p>Stored on this browser. Selecting a search clears the other archive filters.</p>{saved.map(value=><div key={value}><button onClick={()=>onSelect(value)}>{value}</button><button aria-label={`Remove saved search ${value}`} onClick={()=>update(saved.filter(v=>v!==value))}>Remove</button></div>)}<button disabled={!query.trim()||query.length>160||saved.includes(query.trim())||saved.length>=20} onClick={()=>update([...saved,query.trim()])}>Save current search</button><p role="status">{message}</p></details></section>;
}
