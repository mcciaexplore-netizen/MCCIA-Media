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
    (async()=>{try{const {db}=getStorageBindings();await ensureFormIntakeSchema(db);const row=await db.prepare("SELECT SUM(CASE WHEN error_message IS NOT NULL OR status='Delivery failed' OR (status='Processing' AND received_at < ?) THEN 1 ELSE 0 END) AS failures, MAX(received_at) AS lastReceived FROM google_form_intake WHERE status NOT IN ('Rejected','Auto-published')").bind(new Date(Date.now()-15*60000).toISOString()).first<{failures:number|null;lastReceived:string|null}>();uploads={state:row?.failures?'attention':'connected',failures:row?.failures||0,message:row?.failures?'Some received uploads need another processing attempt.':'Storage is connected. Form delivery must also be configured.'};}catch{/* No private submission information is returned. */}})()
  ]);
  return Response.json({checkedAt:new Date().toISOString(),discovery,uploads},{headers:{'Cache-Control':'no-store'}});
}
