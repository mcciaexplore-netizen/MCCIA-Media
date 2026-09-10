import { validPublicationDate } from '@/app/media-metadata';
import { ensureFormIntakeSchema, ensureUploadsSchema, getStorageBindings } from '@/db';
import { inferDgEngagementType, mentionsDg, normalizeDgEngagementType } from '@/app/dg-classification';
import { authorizeEditor, editorRequired } from '../../editor-auth';
import { type FormIntakeRow, toIntakeRecord } from '../route';
export const dynamic='force-dynamic';
const statuses=new Set(['Pending OCR','In review','Approved','Rejected']);
const clean=(v:unknown,max:number)=>String(v??'').replace(/\0/g,'').trim().slice(0,max);
const confidence=(v:unknown,fallback:number|null)=>v===null||v===''?null:v!==undefined&&Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):fallback;

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 const authorization=await authorizeEditor(request);
 if(!authorization.authorized)return editorRequired();
 try{
  const {id}=await context.params;let payload:Record<string,unknown>;
  try{payload=await request.json();if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error();}catch{return Response.json({error:'The editorial update must be a JSON object.'},{status:400});}
  const status=clean(payload.status,50);if(!statuses.has(status))return Response.json({error:'Choose a valid intake status.'},{status:400});
  // Publication IDs and reviewer identity are derived exclusively by the server.
  if(payload.approvedRecordId!==undefined)return Response.json({error:'Published evidence is selected from the submission hash, not a supplied record ID.'},{status:400});
  const {db}=getStorageBindings();await ensureFormIntakeSchema(db);await ensureUploadsSchema(db);
  const current=await db.prepare('SELECT * FROM google_form_intake WHERE id = ? LIMIT 1').bind(id).first<FormIntakeRow>();
  if(!current)return Response.json({error:'Inbox record not found.'},{status:404});
  const date=payload.publicationDate===undefined?current.publication_date:clean(payload.publicationDate,10);
  if((status==='Approved'||payload.publicationDate!==undefined)&&!validPublicationDate(date))return Response.json({error:'Correct the publication date; invalid and future dates cannot be saved.'},{status:400});
  const headline=clean(payload.headline,500)||current.headline,ocr=clean(payload.ocrText,100000)||current.ocr_text||'';
  const requested=clean(payload.dgEngagementType,100),normalized=normalizeDgEngagementType(requested);
  if(requested&&!normalized)return Response.json({error:'Choose a valid DG content classification.'},{status:400});
  const dg=normalized??normalizeDgEngagementType(current.dg_engagement_type)??inferDgEngagementType(`${headline} ${ocr} ${current.presence}`);
  if(status==='Approved'&&mentionsDg(`${headline} ${ocr} ${current.presence}`)&&!dg)return Response.json({error:'Choose how DG Sir participated before approval.'},{status:400});
  const now=new Date().toISOString(),actor=authorization.actor,conf=confidence(payload.ocrConfidence,current.ocr_confidence),verification=clean(payload.verificationStatus,100)||current.verification_status;
  const statements:D1PreparedStatement[]=[];let approvedId:string|null=null;
  if(status==='Approved'){
   const existing=await db.prepare('SELECT id FROM clipping_uploads WHERE sha256 = ? LIMIT 1').bind(current.sha256).first<{id:string}>();
   approvedId=existing?.id||`APR-${current.sha256.slice(0,12).toUpperCase()}`;
   if(existing){statements.push(db.prepare("UPDATE clipping_uploads SET status = 'Published', reviewed = 1, headline = ?, ocr_text = ?, ocr_confidence = ?, publication_date = ?, dg_engagement_type = ? WHERE id = ? AND sha256 = ?").bind(headline,ocr,conf,date,dg,approvedId,current.sha256));}
   else{statements.push(db.prepare('INSERT INTO clipping_uploads (id,sha256,uploaded_at,original_filename,original_key,enhanced_key,original_content_type,enhanced_content_type,original_size,enhanced_size,width,height,publisher,publication_date,page,language,headline,ocr_text,ocr_confidence,ocr_languages,presence,dg_engagement_type,status,reviewed,notes,source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(approvedId,current.sha256,now,current.original_filename,current.original_key,current.original_key,current.original_content_type,current.original_content_type,current.original_size,current.original_size,1,1,current.publisher,date,current.page,current.language,headline,ocr,conf,current.ocr_engine||'OCR not recorded',current.presence,dg,'Published',1,'Editorially approved evidence.',current.source_url));}
  }else{
   // Withdraw by the immutable evidence hash even when a stale approved ID is missing.
   statements.push(db.prepare("UPDATE clipping_uploads SET status = 'Withdrawn', reviewed = 0 WHERE sha256 = ?").bind(current.sha256));
  }
  statements.push(db.prepare('UPDATE google_form_intake SET status=?,error_message=?,approved_record_id=?,approved_at=?,headline=?,ocr_text=?,ocr_confidence=?,verification_status=?,dg_engagement_type=?,reviewed_by=?,reviewed_at=?,updated_at=?,publication_date=? WHERE id=?').bind(status,clean(payload.errorMessage,2000)||null,approvedId,status==='Approved'?now:null,headline,ocr||null,conf,verification,dg,actor,now,now,date,id));
  statements.push(db.prepare('INSERT INTO audit_events (id,created_at,record_id,action,actor,previous_status,new_status,details,source) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),now,id,'EDITORIAL_STATUS_CHANGED',actor,current.status,status,status==='Approved'?`Approved as ${approvedId}`:'Publication withdrawn or held for review','Authenticated editorial review'));
  await db.batch(statements);
  const saved=await db.prepare('SELECT * FROM google_form_intake WHERE id = ?').bind(id).first<FormIntakeRow>();
  if(!saved)throw new Error('Updated record could not be reloaded.');
  return Response.json({record:toIntakeRecord(saved)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to update the inbox record.'},{status:500});}
}
