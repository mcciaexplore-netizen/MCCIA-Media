import {useState} from 'react';
export type Access={configured:boolean;user:{id:string;name:string;role:string}|null;users:{id:string;name:string;role:string}[]};
export default function TeamAccess({access,refresh}:{access:Access;refresh:()=>Promise<void>}){
 const [name,setName]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState('Editor'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(action:string){setBusy(true);setMessage('');try{const r=await fetch('/api/work-tracker/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,name,password,role})});const d=await r.json() as {error?:string;message:string};if(!r.ok)throw Error(d.error);setPassword('');setMessage(d.message);await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Account action failed.')}finally{setBusy(false)}}
 return <details className="wt-team" open={!access.user}><summary>Team access · {access.user?access.configured?`${access.user.name} (${access.user.role})`:`Local owner preview · ${access.user.name}`:'Sign in'}</summary><p>{access.configured?'Accounts and records are stored on this computer.':'Local owner preview. Enable team sign-in to require an account for every tracker request.'} Remote shared access is not enabled.</p><form onSubmit={e=>{e.preventDefault();void submit(!access.configured?'setup':!access.user?'login':'add')}}>{(!access.configured||!access.user||access.user.role==='Administrator')&&<><div className="wt-form-grid"><label>Team member name<input autoComplete="username" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Password<input type="password" autoComplete={access.user?'new-password':'current-password'} minLength={access.user?12:1} maxLength={200} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{access.configured&&access.user?.role==='Administrator'&&<label>Permission<select value={role} onChange={e=>setRole(e.target.value)}>{['Editor','Reviewer','Viewer','Administrator'].map(r=><option key={r}>{r}</option>)}</select></label>}</div><button disabled={busy}>{!access.configured?'Enable sign-in with an administrator':!access.user?'Sign in':'Add team member'}</button></>}{access.configured&&access.user&&<button type="button" disabled={busy} onClick={()=>void submit('logout')}>Sign out</button>}</form>{message&&<p role="status">{message}</p>}{access.users.length>0&&<ul>{access.users.map(u=><li key={u.id}>{u.name} · {u.role}</li>)}</ul>}<p>Viewers read; editors update work; reviewers authorise stages; administrators manage accounts. Use named individual accounts for accountability.</p></details>
}
import {useState} from 'react';

export type Access={zohoReady?:boolean;configured:boolean;user:{id:string;name:string;role:string}|null;users:{id:string;name:string;role:string}[]};

export default function TeamAccess({access,refresh}:{access:Access;refresh:()=>Promise<void>}){

 const [expanded,setExpanded]=useState(false);

 const [name,setName]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState('Editor'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);

 async function submit(action:string){setBusy(true);setMessage('');try{const r=await fetch('/api/work-tracker/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,name,password,role})});const d=await r.json() as {error?:string;message:string};if(!r.ok)throw Error(d.error);setPassword('');setMessage(d.message);await refresh()}catch(e){setMessage(e instanceof Error?e.message:'Account action failed.')}finally{setBusy(false)}}

 const canManage=!access.configured||access.user?.role==='Administrator';

 const showPanel=!access.user||expanded;

 const initials=(access.user?.name||'Team').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('');

 return <section className="wt-team wt-account" aria-label="Team access">

 <div className="wt-account-bar"><div className="wt-account-identity"><span className="wt-avatar" aria-hidden="true">{initials}</span><div><strong>{access.user?.name||'Welcome to your workspace'}</strong><div className="wt-account-meta"><span className="wt-role">{access.user?access.configured?access.user.role:'Local owner preview':'Sign in to continue'}</span><span>On this computer only</span></div></div></div><div className="wt-account-actions">{access.zohoReady?<a className="wt-zoho-login" href="/api/work-tracker/zoho/start">Sign in with Zoho</a>:<span className="wt-zoho-pending">Zoho sign-in · Setup needed</span>}{access.user&&<button type="button" aria-expanded={showPanel} aria-controls="wt-team-panel" onClick={()=>setExpanded(v=>!v)}>{showPanel?'Close settings':canManage?'Manage team':'Account details'}</button>}{access.configured&&access.user&&<button type="button" disabled={busy} onClick={()=>void submit('logout')}>Sign out</button>}</div></div>

 {message&&<p className="wt-account-message" role="status">{message}</p>}

 {showPanel&&<div id="wt-team-panel" className="wt-team-panel"><div className="wt-team-editor"><h3>{!access.configured?'Set up team sign-in':!access.user?'Sign in':canManage?'Add a team member':'Account details'}</h3><p>{access.configured?'Accounts and records are stored on this computer.':'Local owner preview. Enable team sign-in to require an account for every tracker request.'} Remote shared access is not enabled.</p>

 {(!access.user||canManage)&&<form onSubmit={e=>{e.preventDefault();void submit(!access.configured?'setup':!access.user?'login':'add')}}><div className="wt-form-grid"><label>Team member name<input autoComplete="username" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Password<input type="password" autoComplete={access.user?'new-password':'current-password'} minLength={access.user?12:1} maxLength={200} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{access.configured&&access.user?.role==='Administrator'&&<label>Permission<select value={role} onChange={e=>setRole(e.target.value)}>{['Editor','Reviewer','Viewer','Administrator'].map(r=><option key={r}>{r}</option>)}</select></label>}</div><button className="wt-primary" disabled={busy}>{busy?'Please wait…':!access.configured?'Enable team sign-in':!access.user?'Sign in':'Add team member'}</button></form>}</div>

 <aside className="wt-team-members"><h3>Workspace team <span>{access.users.length}</span></h3>{access.users.length>0&&<ul>{access.users.map(u=><li key={u.id}><strong>{u.name}</strong><span className="wt-role">{u.role}</span></li>)}</ul>}<p>Viewers read · Editors update work · Reviewers authorise stages · Administrators manage accounts.</p></aside></div>}</section>;

}

