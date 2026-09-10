import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:new URL('./storage-env.mjs',import.meta.url).href,shortCircuit:true};
 let file;if(specifier.startsWith('@/'))file=path.join(root,specifier.slice(2));
 else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))file=fileURLToPath(new URL(specifier,context.parentURL));
 if(file&&!path.extname(file)){for(const candidate of [file+'.ts',path.join(file,'index.ts')])if(existsSync(candidate))return {url:pathToFileURL(candidate).href,shortCircuit:true};}
 if(file&&path.extname(file)&&existsSync(file))return next(pathToFileURL(file).href,context);
 return next(specifier,context);
}
