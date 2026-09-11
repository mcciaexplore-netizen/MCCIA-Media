'use client';
import {useEffect} from 'react';
import metadata from './archive-metadata.json';
import discovery from './discovery-status.json';

export function useArchiveRefresh() {
  useEffect(()=>{
    let cancelled=false;
    const version=`${metadata.dataHash}:${discovery.checkedAt}`;
    const refresh=async()=>{
      // Preserve an unfinished correction or report-error form.
      if(document.visibilityState!=='visible'||document.querySelector('dialog[open], [role="dialog"]'))return;
      const active=document.activeElement;
      if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return;
      try{
        const response=await fetch('/api/archive-version',{cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(!response.ok)return;
        const value=await response.json() as {version?:unknown};
        if(!cancelled&&typeof value.version==='string'&&value.version!==version)window.location.reload();
      }catch{/* A failed version check leaves the current archive usable. */}
    };
    const timer=setInterval(()=>void refresh(),60000);
    const visible=()=>void refresh();
    document.addEventListener('visibilitychange',visible);
    return()=>{cancelled=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
  },[]);
}
