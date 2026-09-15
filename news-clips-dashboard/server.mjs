import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const origin='https://mccia-media.vercel.app';
let cache=null, flight=null;
async function json(url){const response=await fetch(url,{headers:{'User-Agent':'MCCIA-independent-analytics','Accept':'application/json'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();}
async function pages(route){let rows=[],cursor=null;const seen=new Set();do{const body=await json(`${origin}/api/${route}?limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`);if(!Array.isArray(body.records))throw Error('Invalid response');rows.push(...body.records);cursor=body.nextCursor||null;if(cursor&&seen.has(cursor))throw Error('Repeated cursor');seen.add(cursor);if(seen.size>1000)throw Error('Pagination limit exceeded');}while(cursor);return rows;}
async function collect(){
 const commit=await json('https://api.github.com/repos/mcciaexplore-netizen/MCCIA-Media/commits/main');
 const names=['records','clippings','epaper-sources','google-news-alerts','archive-metadata','discovery-status','source-verification'];
 const values=await Promise.all(names.map(name=>json(`https://raw.githubusercontent.com/mcciaexplore-netizen/MCCIA-Media/${commit.sha}/app/${name}.json`)));
 const data=Object.fromEntries(names.map((name,i)=>[name,values[i]]));
 const connections=await Promise.all(['uploads','source-monitoring','corrections','archive-version'].map(async name=>{try{return {name,ok:true,data:await(name==='archive-version'?json(origin+'/api/'+name):pages(name))};}catch(e){return {name,ok:false,error:e.message};}}));
 return {data,connections,commit:commit.sha,checkedAt:new Date().toISOString(),origin};
}
async function snapshot(){if(cache&&Date.now()-Date.parse(cache.checkedAt)<60000)return cache;if(!flight)flight=collect().then(result=>(cache=result)).finally(()=>flight=null);return flight;}
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/dashboard'){try{const result=await snapshot();res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));}catch(e){res.statusCode=cache?200:503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(cache?{...cache,stale:true,error:e.message}:{error:'Archive connection unavailable: '+e.message}));}return;}
 const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);const target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep)||!['.html','.css','.js','.png'].includes(path.extname(target))){res.writeHead(404).end();return;}
 const contents=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(target)]);res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.end(contents);
 }catch{res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT)||3003,'127.0.0.1',()=>console.log('News clips dashboard: http://127.0.0.1:'+(process.env.PORT||3003)));


