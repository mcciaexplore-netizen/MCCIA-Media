'use client';
import {useState} from 'react';
export default function EditorSignIn({onSignedIn}:{onSignedIn:()=>void}){
 const[key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <form className="editor-sign-in" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/editor-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});const v=await r.json() as {error?:string};if(!r.ok)throw new Error(v.error);setKey('');onSignedIn()}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.')}finally{setBusy(false)}}}><h3>Editor sign-in</h3><p>Submissions and editorial actions are private.</p><label>Editor access key<input type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="current-password" required/></label><button disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<p role="alert">{error}</p>}</form>
}
