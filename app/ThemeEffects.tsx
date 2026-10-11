'use client';
import {useEffect} from 'react';

// Visual-only effects: count-up stats and a drifting background grid.
// Stat text is updated through the existing text node so React keeps owning it.
const STAT_SELECTOR='.analytics-kpis strong, .metrics strong, .desk-stats strong, .wt-metrics strong, .wt-hero-totals strong';
const CELL=45;

function countUp(el:HTMLElement){
  const node=el.firstChild;
  if(!node||node.nodeType!==Node.TEXT_NODE||el.dataset.counted)return;
  const raw=(node.nodeValue||'').trim();
  if(!/^[\d,]+$/.test(raw))return;
  const target=Number(raw.replace(/,/g,''));
  if(!Number.isFinite(target)||target<=0)return;
  el.dataset.counted='1';
  const start=performance.now(),duration=1800;
  const step=(now:number)=>{
    const p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);
    node.nodeValue=p<1?Math.round(target*eased).toLocaleString('en-IN'):raw;
    if(p<1)requestAnimationFrame(step);
  };
  node.nodeValue='0';
  requestAnimationFrame(step);
}

export default function ThemeEffects(){
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const seen=new WeakSet<Element>();
    const io=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){io.unobserve(e.target);countUp(e.target as HTMLElement)}},{threshold:0.1});
    const scan=()=>document.querySelectorAll<HTMLElement>(STAT_SELECTOR).forEach(el=>{if(!seen.has(el)){seen.add(el);io.observe(el)}});
    scan();
    const mo=new MutationObserver(scan);mo.observe(document.body,{childList:true,subtree:true});

    const canvas=document.createElement('canvas');canvas.className='theme-grid-canvas';canvas.setAttribute('aria-hidden','true');
    document.body.insertBefore(canvas,document.body.firstChild);
    const ctx=canvas.getContext('2d');
    let w=0,h=0,offset=0,raf=0,mx=-1,my=-1;const trail:{c:number;r:number}[]=[];
    const resize=()=>{const d=window.devicePixelRatio||1;w=window.innerWidth;h=window.innerHeight;canvas.width=w*d;canvas.height=h*d;ctx?.setTransform(d,0,0,d,0,0)};
    const move=(e:MouseEvent)=>{mx=e.clientX;my=e.clientY};
    const draw=()=>{
      if(!ctx)return;
      ctx.clearRect(0,0,w,h);offset=(offset+0.4)%CELL;
      ctx.strokeStyle='rgba(0,63,138,0.04)';ctx.lineWidth=1;ctx.beginPath();
      for(let x=-CELL+offset;x<w+CELL;x+=CELL){ctx.moveTo(x,0);ctx.lineTo(x,h)}
      for(let y=-CELL+offset;y<h+CELL;y+=CELL){ctx.moveTo(0,y);ctx.lineTo(w,y)}
      ctx.stroke();
      if(mx>=0){const c=Math.floor((mx-offset)/CELL),r=Math.floor((my-offset)/CELL);const last=trail[0];if(!last||last.c!==c||last.r!==r){trail.unshift({c,r});if(trail.length>6)trail.pop()}}
      trail.forEach((t,i)=>{ctx.fillStyle=`rgba(0,63,138,${0.06*(1-i/trail.length)})`;ctx.fillRect(t.c*CELL+offset,t.r*CELL+offset,CELL,CELL)});
      raf=requestAnimationFrame(draw);
    };
    resize();window.addEventListener('resize',resize);window.addEventListener('mousemove',move,{passive:true});raf=requestAnimationFrame(draw);
    return()=>{io.disconnect();mo.disconnect();cancelAnimationFrame(raf);window.removeEventListener('resize',resize);window.removeEventListener('mousemove',move);canvas.remove()};
  },[]);
  return null;
}
