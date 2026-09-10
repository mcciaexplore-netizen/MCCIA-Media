import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client/web';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Durable SQLite and private S3-compatible object storage for native Next/Vercel.
// Cloudflare deployments continue to use their native D1/R2 bindings.
class Statement {
 readonly client:Client; readonly sql:string; readonly args:InValue[];
 constructor(client:Client,sql:string,args:InValue[]=[]){this.client=client;this.sql=sql;this.args=args;}
 bind(...args:unknown[]){return new Statement(this.client,this.sql,args.map(value=>value===undefined?null:value) as InValue[]);}
 async result(){return this.client.execute({sql:this.sql,args:this.args});}
 async all<T>(){return convert<T>(await this.result());}
 async first<T>(column?:string){const result=await this.result();const row=result.rows[0];return row?(column?row[column]:row) as T:null;}
 async run(){return convert(await this.result());}
}
function convert<T>(result:ResultSet){return {success:true,results:result.rows as unknown as T[],meta:{changes:result.rowsAffected,last_row_id:Number(result.lastInsertRowid||0)}};}
let bindings:{db:D1Database;files:R2Bucket}|undefined;
export function getVercelStorageBindings(){
 if(bindings)return bindings;
 const e=process.env;
 const required=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'];
 if(required.some(key=>!e[key]))throw new Error('Submission storage is not configured for Vercel. An administrator must connect the durable database and private evidence bucket.');
 const client=createClient({url:e.TURSO_DATABASE_URL!,authToken:e.TURSO_AUTH_TOKEN!});
 const db={prepare:(sql:string)=>new Statement(client,sql),batch:async (statements:Statement[])=>{
  const results=await client.batch(statements.map(s=>({sql:s.sql,args:s.args})),'write');return results.map(convert);
 }};
 const s3=new S3Client({region:e.S3_REGION||'auto',endpoint:e.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:e.S3_ACCESS_KEY_ID!,secretAccessKey:e.S3_SECRET_ACCESS_KEY!}});
 const bucket=e.S3_BUCKET!;
 const files={
  async put(key:string,value:ReadableStream|ArrayBuffer|Uint8Array|string,options?:{httpMetadata?:{contentType?:string};customMetadata?:Record<string,string>}){
   const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof Uint8Array?value:new Uint8Array(value instanceof ArrayBuffer?value:await new Response(value).arrayBuffer());
   await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:options?.httpMetadata?.contentType,Metadata:options?.customMetadata}));return {key,size:bytes.length};
  },
  async get(key:string){try{const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));if(!object.Body)return null;const body=object.Body.transformToWebStream();return {body,httpMetadata:{contentType:object.ContentType},size:object.ContentLength,arrayBuffer:()=>new Response(body).arrayBuffer(),text:()=>new Response(body).text(),json:()=>new Response(body).json()};}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)return null;throw error;}},
  async delete(key:string){await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));},
 };
 bindings={db:db as unknown as D1Database,files:files as unknown as R2Bucket};return bindings;
}
