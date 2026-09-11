import { ensureUploadsSchema } from '@/db';
import { validPublicationDate } from '@/app/media-metadata';
import archive from '@/app/clippings.json' with {type:'json'};
import type { FormIntakeRow } from './form-intake/route';

// Called only after authenticated automation has stored the original evidence.
// Automatic publication is explicitly distinct from human verification.
export async function publishAutomatically(db: D1Database, row: FormIntakeRow) {
  if (row.status === 'Rejected') return null;
  if (row.publication_date && !validPublicationDate(row.publication_date)) throw new Error('Invalid or future publication date.');
  if ((row.original_content_type.startsWith('image/') || row.original_content_type === 'application/pdf') && !row.ocr_text?.trim()) { await db.prepare("UPDATE google_form_intake SET status='OCR retry pending', error_message='OCR has not produced readable text; publication paused.' WHERE id=?").bind(row.id).run(); return null; }
  await ensureUploadsSchema(db);
  const existing = await db.prepare('SELECT id,status FROM clipping_uploads WHERE sha256 = ? LIMIT 1').bind(row.sha256).first<{id:string;status:string}>();
  // A retry must never undo an intentional withdrawal.
  if (existing?.status === 'Withdrawn') return null;
  const historical = archive.find(item => item.sha256 === row.sha256);
  const id = existing?.id || historical?.id || `AUTO-${row.sha256.slice(0,12).toUpperCase()}`;
  const now = new Date().toISOString();
  const statements:D1PreparedStatement[] = [];
  const headline = row.headline && !/^[>_=]|\bSRA\b|requires.*review/i.test(row.headline) ? row.headline : `${row.publisher} clipping`;
  if (!existing) statements.push(db.prepare(`INSERT INTO clipping_uploads
    (id,sha256,uploaded_at,original_filename,original_key,enhanced_key,original_content_type,enhanced_content_type,original_size,enhanced_size,width,height,publisher,publication_date,page,language,headline,ocr_text,ocr_confidence,ocr_languages,presence,dg_engagement_type,status,reviewed,notes,source_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,row.sha256,now,row.original_filename,row.original_key,row.original_key,row.original_content_type,row.original_content_type,row.original_size,row.original_size,1,1,row.publisher,row.publication_date,row.page,row.language,headline,row.ocr_text||'',row.ocr_confidence,row.ocr_engine||'OCR unavailable',row.presence,row.dg_engagement_type,'Auto-published',0,'Automatically processed from uploaded evidence. Metadata and OCR have not been editorially verified.',row.source_url));
  statements.push(db.prepare("UPDATE google_form_intake SET status='Auto-published', approved_record_id=?, updated_at=?, error_message=NULL WHERE id=?").bind(id,now,row.id));
  if (row.status !== 'Auto-published') statements.push(db.prepare('INSERT INTO audit_events (id,created_at,record_id,action,actor,previous_status,new_status,details,source) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),now,row.id,'AUTOMATIC_PUBLICATION','Authenticated form automation',row.status,'Auto-published',`Evidence available as ${id}; no editorial verification asserted.`,'Automatic upload processing'));
  await db.batch(statements);
  return id;
}
