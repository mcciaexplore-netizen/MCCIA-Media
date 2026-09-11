import {driveConfigured,driveRequest} from '../drive-backend';
import {authorizeAutomationRequest} from '../automation-auth';
import {cleanupExpiredTransfers} from '../transfer-cleanup';
import snapshot from '@/app/discovery-status.json' with {type:'json'};
import {getStorageBindings,ensureFormIntakeSchema} from '@/db';

export const dynamic='force-dynamic';
const workflow='https://api.github.com/repos/mcciaexplore-netizen/MCCIA-Media/actions/workflows/weekly-google-news.yml/runs?per_page=30';
export async function GET(){
  let discovery:Record<string,unknown>={state:'unavailable',message:'Discovery status could not be checked.'};
  let uploads:Record<string,unknown>={state:'unavailable',message:'Automatic upload storage is not connected.'};
  await Promise.allSettled([
    (async()=>{try{
      const response=await fetch(workflow,{headers:{Accept:'application/vnd.github+json'},next:{revalidate:300},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Unavailable');
      const body=await response.json() as {workflow_runs?:{status:string;conclusion:string|null;created_at:string;html_url:string}[]};
      if(!Array.isArray(body.workflow_runs))throw new Error('Invalid status response');
      const runs=body.workflow_runs,latest=runs[0],failed=runs.find(r=>r.status==='completed'&&r.conclusion!=='success'&&r.conclusion!=='skipped'),success=runs.find(r=>r.conclusion==='success');
      discovery={state:!latest?'never-run':latest.status!=='completed'?'running':latest.conclusion==='success'?'success':'failed',partial:snapshot.state==='partial',failedWatches:snapshot.failedWatches,lastRun:latest?.created_at,lastSuccess:success?.created_at,runUrl:latest?.html_url,lastFailure:failed?{date:failed.created_at,url:failed.html_url}:null};
    }catch{/* Unavailable is deliberately distinct from a successful run. */}})(),
    (async()=>{try{if(driveConfigured()){uploads=await driveRequest('health');return}const {db}=getStorageBindings();await ensureFormIntakeSchema(db);const row=await db.prepare("SELECT SUM(CASE WHEN error_message IS NOT NULL OR status='Delivery failed' OR (status='Processing' AND received_at < ?) THEN 1 ELSE 0 END) AS failures, MAX(received_at) AS lastReceived FROM google_form_intake WHERE status NOT IN ('Rejected','Auto-published')").bind(new Date(Date.now()-15*60000).toISOString()).first<{failures:number|null;lastReceived:string|null}>();await db.prepare('CREATE TABLE IF NOT EXISTS pipeline_health (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();const health=await db.prepare("SELECT payload,updated_at FROM pipeline_health WHERE id='drive'").first<{payload:string;updated_at:string}>();const details=health?JSON.parse(health.payload):null;uploads={pipeline:details,pipelineCheckedAt:health?.updated_at,state:row?.failures?'attention':'connected',failures:row?.failures||0,message:row?.failures?'Some received uploads need another processing attempt.':'Storage is connected. Form delivery must also be configured.'};}catch{/* No private submission information is returned. */}})()
  ]);
  if(uploads.pipeline && typeof uploads.pipeline==='object' && ('pendingOcr' in uploads.pipeline) && Number(uploads.pipeline.pendingOcr)>0){uploads.state='attention';uploads.message=`${uploads.pipeline.pendingOcr} uploads are waiting for an automatic OCR retry.`;}
  return Response.json({checkedAt:new Date().toISOString(),discovery,uploads},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
 const auth=await authorizeAutomationRequest(request);if(!auth.authorized)return Response.json({error:'Unauthorized'},{status:401});
 try{const input=await request.json() as {pendingOcr?:number;deliveryFailures?:number};if(![input.pendingOcr,input.deliveryFailures].every(v=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1000000))return Response.json({error:'Invalid counts'},{status:400});
 const {db}=getStorageBindings();await db.prepare('CREATE TABLE IF NOT EXISTS pipeline_health (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();await db.prepare("INSERT INTO pipeline_health (id,payload,updated_at) VALUES ('drive',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify({pendingOcr:input.pendingOcr,deliveryFailures:input.deliveryFailures}),new Date().toISOString()).run();const removed=await cleanupExpiredTransfers();return Response.json({ok:true,expiredTransfersRemoved:removed});
 }catch{return Response.json({error:'Pipeline status or cleanup could not be saved.'},{status:503})}
}
