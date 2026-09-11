import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {driveRequest,driveImage} from '../app/api/drive-backend.ts';

test('Drive requests are signed; published evidence preserves byte ranges and rejects unsafe content types',async()=>{
 const previousFetch=globalThis.fetch,oldUrl=process.env.DRIVE_GATEWAY_URL,oldSecret=process.env.DRIVE_GATEWAY_SECRET;
 const secret='test-only-drive-secret-with-at-least-32-characters';process.env.DRIVE_GATEWAY_URL='https://script.google.com/macros/s/test-deployment/exec';process.env.DRIVE_GATEWAY_SECRET=secret;
 const bytes=Buffer.from('sample clipping'),calls=[];let mime='image/png';
 globalThis.fetch=async(url,options)=>{assert.equal(url,process.env.DRIVE_GATEWAY_URL);const envelope=JSON.parse(options.body);assert.equal(envelope.signature,createHmac('sha256',secret).update(envelope.payload).digest('hex'));const call=JSON.parse(envelope.payload);assert.ok(call.nonce);assert.ok(Math.abs(Date.now()-call.at)<1000);calls.push(call);return Response.json({ok:true,data:call.action==='fileInfo'?{size:bytes.length,type:mime,name:'Published clipping'}:call.action==='fileChunk'?{base64:bytes.subarray(call.data.start,call.data.end+1).toString('base64')}:{records:[],nextCursor:null}})};
 try{
  assert.deepEqual(await driveRequest('published'),{records:[],nextCursor:null});
  const image=await driveImage(new Request('https://website.test/image',{headers:{Range:'bytes=2-6'}}),'AUTO-1');assert.equal(image.status,206);assert.equal(image.headers.get('Content-Range'),`bytes 2-6/${bytes.length}`);assert.equal(await image.text(),bytes.subarray(2,7).toString());assert.equal(calls.at(-1).data.id,'AUTO-1');
  assert.equal((await driveImage(new Request('https://website.test/image',{headers:{Range:'bytes=900-'}}),'AUTO-1')).status,416);
  mime='text/html';await assert.rejects(()=>driveImage(new Request('https://website.test/image'),'AUTO-1'),/Unsupported/);
 }finally{globalThis.fetch=previousFetch;if(oldUrl===undefined)delete process.env.DRIVE_GATEWAY_URL;else process.env.DRIVE_GATEWAY_URL=oldUrl;if(oldSecret===undefined)delete process.env.DRIVE_GATEWAY_SECRET;else process.env.DRIVE_GATEWAY_SECRET=oldSecret}
});
