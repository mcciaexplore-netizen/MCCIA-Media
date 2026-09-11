import {driveConfigured,driveRequest} from '../drive-backend';
import { authorizeEditor, editorRequired } from '../editor-auth';
import { pageRequest, pageResult } from '../pagination';
import { normalizeLanguage, validPublicationDate, normalizeRecordMetadata } from '@/app/media-metadata';
import { ensureFormIntakeSchema, ensureUploadsSchema, getStorageBindings } from '@/db';
import { inferDgEngagementType, mentionsDg, normalizeDgEngagementType } from '@/app/dg-classification';
import archive from '@/app/clippings.json' with {type:'json'};

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadedRow = {
  id: string;
  sha256: string;
  uploaded_at: string;
  original_filename: string;
  original_key: string;
  enhanced_key: string;
  original_content_type: string;
  enhanced_content_type: string;
  original_size: number;
  enhanced_size: number;
  width: number;
  height: number;
  publisher: string;
  publication_date: string;
  page: string | null;
  language: string;
  headline: string;
  ocr_text: string;
  ocr_confidence: number | null;
  ocr_languages: string;
  presence: string;
  dg_engagement_type: string | null;
  status: string;
  reviewed: number;
  notes: string;
  source_url: string | null;
};

type UploadMetadata = {
  intakeId?: string;
  publisher?: string;
  publicationDate?: string;
  page?: string;
  language?: string;
  headline?: string;
  ocrText?: string;
  ocrConfidence?: number;
  ocrLanguages?: string;
  presence?: string;
  dgEngagementType?: string;
  notes?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  reviewed?: boolean;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function clean(value: unknown, maxLength: number, fallback = '') {
  const result = String(value ?? '').replace(/\0/g, '').trim();
  return (result || fallback).slice(0, maxLength);
}

const validDate = validPublicationDate;

function validSourceUrl(value: unknown) {
  const candidate = clean(value, 2000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function toClippingRecord(row: UploadedRow) {
  const imageBase = `/api/uploads/${encodeURIComponent(row.id)}/image`;
  const automated = row.status === 'Auto-published';
  const enhanced = row.original_key !== row.enhanced_key;
  const historical = archive.find(item => item.sha256 === row.sha256);
  return normalizeRecordMetadata({
    id: row.id,
    sha256: row.sha256,
    year: Number(row.publication_date.slice(0, 4)) || null,
    date: row.publication_date,
    publisher: row.publisher,
    page: row.page,
    originalFilename: row.original_filename,
    duplicateFilenames: [],
    sourceArchive: automated ? 'Automatic form upload' : 'Owner upload',
    thumbnailUrl: row.original_content_type.startsWith('image/') ? `${imageBase}?variant=enhanced` : row.original_content_type === 'application/pdf' ? '/fallbacks/pdf.webp' : '/fallbacks/video.webp',
    originalImageUrl: `${imageBase}?variant=original`,
    originalContentType: row.original_content_type,
    enhancedImageUrl: enhanced ? `${imageBase}?variant=enhanced` : undefined,
    width: row.width,
    height: row.height,
    quality: enhanced ? 'Enhanced' : 'Original',
    matchStatus: automated ? 'Automatically processed upload' : 'New upload · OCR reviewed',
    matchedRecordId: historical?.matchedRecordId || null,
    ocrStatus: row.ocr_text ? 'Completed' : 'Not available',
    ocrHeadline: row.headline,
    ocrExcerpt: row.ocr_text.slice(0, 650),
    ocrText: row.ocr_text,
    ocrConfidence: row.ocr_confidence,
    ocrEngine: enhanced ? 'Tesseract.js 7' : row.ocr_languages,
    ocrModel: enhanced ? row.ocr_languages : null,
    ocrReviewStatus: row.reviewed ? 'Reviewed during upload' : 'Automatic transcription · not editorially verified',
    reviewDecision: row.notes,
    publicSourceUrl: row.source_url,
    publicSourceTitle: null,
    sourceSearchStatus: row.source_url ? 'supplied-at-upload' : 'not-searched',
    sourceCandidates: [],
    language: row.language,
    presence: row.presence,
    dgEngagementType: normalizeDgEngagementType(row.dg_engagement_type),
    uploadedAt: row.uploaded_at,
    uploaded: true,
    automated,
    status: row.status,
  });
}

export async function GET(request: Request) {
  try {
    if(driveConfigured()){
      const params=new URL(request.url).searchParams;
      const page=await driveRequest<{records:Record<string,unknown>[];nextCursor:string|null}>('published',{cursor:params.get('cursor')||'',limit:Math.min(100,Math.max(1,Number(params.get('limit'))||100))});
      return Response.json({...page,records:page.records.map(row=>({...row,matchedRecordId:archive.find(item=>item.sha256===row.sha256)?.matchedRecordId||null}))},{headers:{'Cache-Control':'no-store'}});
    }
    const { db } = getStorageBindings();
    await ensureUploadsSchema(db);
    const {limit,before}=pageRequest(request,50);
    const result=await db.prepare("SELECT * FROM clipping_uploads WHERE ((reviewed = 1 AND status = 'Published') OR status = 'Auto-published') AND (? IS NULL OR uploaded_at < ? OR (uploaded_at = ? AND id < ?)) ORDER BY uploaded_at DESC, id DESC LIMIT ?").bind(before?.at??null,before?.at??null,before?.at??null,before?.id??null,limit+1).all<UploadedRow>();
    const page=pageResult(result.results??[],limit,r=>r.uploaded_at,r=>r.id);
    return Response.json(
      { records: page.records.map(toClippingRecord), nextCursor: page.nextCursor },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load uploaded clippings.', 503);
  }
}

export async function POST(request: Request) {
  const authorization=await authorizeEditor(request);
  if(!authorization.authorized)return editorRequired();
  let originalKey = '';
  let enhancedKey = '';
  try {
    const form = await request.formData();
    const original = form.get('original');
    const enhanced = form.get('enhanced');
    const metadataValue = form.get('metadata');
    if (!(original instanceof File) || !(enhanced instanceof File) || typeof metadataValue !== 'string') {
      return jsonError('Original image, enhanced image and metadata are required.', 400);
    }
    if (!ACCEPTED_TYPES.has(original.type) || !ACCEPTED_TYPES.has(enhanced.type)) {
      return jsonError('Use a JPG, PNG or WebP newspaper image.', 415);
    }
    if (!original.size || !enhanced.size || original.size > MAX_IMAGE_BYTES || enhanced.size > MAX_IMAGE_BYTES) {
      return jsonError('Each image must be between 1 byte and 100 MB.', 413);
    }

    let metadata: UploadMetadata;
    try {
      const parsed = JSON.parse(metadataValue) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid metadata object');
      metadata = parsed as UploadMetadata;
    } catch {
      return jsonError('The clipping metadata is not valid JSON.', 400);
    }
    if (metadata.reviewed !== true) {
      return jsonError('Review the OCR fields before saving the clipping.', 400);
    }
    const ocrText = clean(metadata.ocrText, 100_000);
    if (!ocrText) return jsonError('OCR text is required before saving.', 400);
    const publicationDate = validDate(metadata.publicationDate);
    if (!publicationDate) return jsonError('Enter a real publication date that is not in the future before saving.', 400);
    const requestedDgEngagementType = clean(metadata.dgEngagementType, 100);
    const normalizedDgEngagementType = normalizeDgEngagementType(requestedDgEngagementType);
    if (requestedDgEngagementType && !normalizedDgEngagementType) {
      return jsonError('Choose one of the three available DG content classifications.', 400);
    }
    const dgEvidence = `${metadata.headline || ''} ${ocrText} ${metadata.presence || ''}`;
    const dgEngagementType = normalizedDgEngagementType ?? inferDgEngagementType(dgEvidence);
    if (mentionsDg(dgEvidence) && !dgEngagementType) {
      return jsonError('Choose how DG Sir participated in this coverage before approval.', 400);
    }

    const hash = await sha256(original);
    const id = `UPL-${hash.slice(0, 12).toUpperCase()}`;
    const { db, files } = getStorageBindings();
    await ensureUploadsSchema(db);
    const intakeId = clean(metadata.intakeId, 200);
    if (intakeId) {
      await ensureFormIntakeSchema(db);
      const intake = await db.prepare('SELECT id, sha256 FROM google_form_intake WHERE id = ? LIMIT 1').bind(intakeId).first<{ id: string; sha256: string }>();
      if (!intake) return jsonError('The submission inbox record was not found.', 400);
      if(intake.sha256!==hash)return jsonError('This evidence does not belong to the selected submission.',409);
    }
    const existing = await db
      .prepare('SELECT * FROM clipping_uploads WHERE sha256 = ? LIMIT 1')
      .bind(hash)
      .first<UploadedRow>();
    if (existing) {
      const statements = [db.prepare("UPDATE clipping_uploads SET status = 'Published', reviewed = 1 WHERE id = ?").bind(existing.id)];
      const existingDgEngagementType = normalizeDgEngagementType(existing.dg_engagement_type);
      const duplicateDgEngagementType = dgEngagementType ?? existingDgEngagementType;
      if (duplicateDgEngagementType && existingDgEngagementType !== duplicateDgEngagementType) {
        statements.push(db.prepare('UPDATE clipping_uploads SET dg_engagement_type = ? WHERE id = ?')
          .bind(duplicateDgEngagementType, existing.id));
        existing.dg_engagement_type = duplicateDgEngagementType;
      }
      if (intakeId) {
        const approvedAt = new Date().toISOString();
        statements.push(
          db.prepare(`UPDATE google_form_intake SET status = 'Approved', approved_record_id = ?, approved_at = ?, dg_engagement_type = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?, error_message = NULL WHERE id = ?`)
            .bind(existing.id, approvedAt, duplicateDgEngagementType, authorization.actor, approvedAt, approvedAt, intakeId),
          db.prepare(`INSERT INTO audit_events (id, created_at, record_id, action, actor, previous_status, new_status, details, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), approvedAt, intakeId, 'EDITORIAL_APPROVED', authorization.actor, 'In review', 'Approved', `Connected to existing evidence ${existing.id}`, 'Dashboard OCR review'),
        );
      }
      if (statements.length) await db.batch(statements);
      existing.status = 'Published';
      existing.reviewed = 1;
      return Response.json({ record: toClippingRecord(existing), duplicate: true });
    }

    originalKey = `uploads/${hash}/original.${extensionFor(original.type)}`;
    enhancedKey = `uploads/${hash}/enhanced.${extensionFor(enhanced.type)}`;
    await Promise.all([
      files.put(originalKey, original.stream(), {
        httpMetadata: { contentType: original.type },
        customMetadata: { clippingId: id, variant: 'original', sha256: hash },
      }),
      files.put(enhancedKey, enhanced.stream(), {
        httpMetadata: { contentType: enhanced.type },
        customMetadata: { clippingId: id, variant: 'enhanced', sha256: hash },
      }),
    ]);

    const uploadedAt = new Date().toISOString();
    const publisher = clean(metadata.publisher, 200, 'Publisher not identified');
    const headline = clean(metadata.headline, 500, 'Headline requires review');
    const language = normalizeLanguage(metadata.language);
    const presence = clean(metadata.presence, 200, 'MCCIA relevance requires review');
    const notes = clean(metadata.notes, 2000, 'Original and enhanced copies preserved; OCR reviewed at upload.');
    const sourceUrl = validSourceUrl(metadata.sourceUrl);
    const width = Math.max(1, Math.min(20_000, Number(metadata.width) || 1));
    const height = Math.max(1, Math.min(20_000, Number(metadata.height) || 1));
    const confidence = metadata.ocrConfidence != null && String(metadata.ocrConfidence) !== '' && Number.isFinite(Number(metadata.ocrConfidence))
      ? Math.max(0, Math.min(100, Number(metadata.ocrConfidence)))
      : null;

    try {
      const insertUpload = db.prepare(`INSERT INTO clipping_uploads (
          id, sha256, uploaded_at, original_filename, original_key, enhanced_key,
          original_content_type, enhanced_content_type, original_size, enhanced_size,
          width, height, publisher, publication_date, page, language, headline,
          ocr_text, ocr_confidence, ocr_languages, presence, dg_engagement_type, status, reviewed, notes, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          hash,
          uploadedAt,
          clean(original.name, 500, 'newspaper-clipping'),
          originalKey,
          enhancedKey,
          original.type,
          enhanced.type,
          original.size,
          enhanced.size,
          width,
          height,
          publisher,
          publicationDate,
          clean(metadata.page, 50) || null,
          language,
          headline,
          ocrText,
          confidence,
          clean(metadata.ocrLanguages, 100, 'eng+mar+hin'),
          presence,
          dgEngagementType,
          'Published',
          1,
          notes,
          sourceUrl,
        );
      if (intakeId) {
        const approveIntake = db.prepare(`UPDATE google_form_intake SET status = 'Approved', approved_record_id = ?, approved_at = ?, dg_engagement_type = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?, error_message = NULL WHERE id = ?`)
          .bind(id, uploadedAt, dgEngagementType, authorization.actor, uploadedAt, uploadedAt, intakeId);
        const audit = db.prepare(`INSERT INTO audit_events (id, created_at, record_id, action, actor, previous_status, new_status, details, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), uploadedAt, intakeId, 'EDITORIAL_APPROVED', authorization.actor, 'In review', 'Approved', `Approved as evidence ${id}`, 'Dashboard OCR review');
        await db.batch([insertUpload, approveIntake, audit]);
      } else {
        await insertUpload.run();
      }
    } catch (error) {
      const duplicate=await db.prepare('SELECT id FROM clipping_uploads WHERE sha256 = ? LIMIT 1').bind(hash).first();
      if(!duplicate)await Promise.allSettled([files.delete(originalKey), files.delete(enhancedKey)]);
      throw error;
    }

    const saved = await db.prepare('SELECT * FROM clipping_uploads WHERE id = ?').bind(id).first<UploadedRow>();
    if (!saved) throw new Error('The clipping was stored but its metadata could not be reloaded.');
    return Response.json({ record: toClippingRecord(saved), duplicate: false }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to save the clipping.', 500);
  }
}
