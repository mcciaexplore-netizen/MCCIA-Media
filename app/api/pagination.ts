export function pageRequest(request: Request, maximum=100){
 const p=new URL(request.url).searchParams;const limit=Math.min(maximum,Math.max(1,Number.parseInt(p.get('limit')||String(maximum),10)||maximum));
 const cursor=p.get('cursor')||'';let before:{at:string;id:string}|null=null;
 if(cursor){try{const v=JSON.parse(atob(cursor));if(typeof v.at!=='string'||typeof v.id!=='string'||v.at.length>100||v.id.length>200)throw new Error();before=v}catch{throw new Error('Invalid page cursor');}}
 return {limit,before};
}
export function pageResult<T>(rows:T[],limit:number,time:(row:T)=>string,id:(row:T)=>string){const records=rows.slice(0,limit),last=records.at(-1);return {records,nextCursor:rows.length>limit&&last?btoa(JSON.stringify({at:time(last),id:id(last)})):null};}
