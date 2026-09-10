'use client';
import {useState} from 'react';
export type SiteSection='archive'|'briefing'|'reports'|'about';
export default function SiteHeader({active,onNavigate,formUrl}:{active:SiteSection;onNavigate:(section:SiteSection)=>void;formUrl:string}){
 const [menu,setMenu]=useState(false);
 const labels:[SiteSection,string][]=[['archive','Archive'],['briefing','Media briefing'],['reports','Reports'],['about','About']];
 return <header className="site-header"><a className="brand" href="#top" aria-label="MCCIA Media Intelligence home" onClick={()=>setMenu(false)}><img className="brand-logo" src="/mccia-logo.png" alt="MCCIA"/><span className="brand-product">Media Intelligence</span></a><nav id="primary-navigation" className={menu?'primary-nav open':'primary-nav'} aria-label="Main navigation">{labels.map(([id,label])=><button key={id} className={active===id?'active':''} aria-current={active===id?'page':undefined} onClick={()=>{onNavigate(id);setMenu(false)}}>{label}</button>)}</nav><a className="header-add" href={formUrl} target="_blank" rel="noreferrer">＋ Add clipping</a><button className="header-menu" aria-expanded={menu} aria-controls="primary-navigation" onClick={()=>setMenu(v=>!v)}>{menu?'Close menu':'Menu'}</button></header>;
}
