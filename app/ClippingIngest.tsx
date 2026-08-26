'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';

export type UploadedClipping = {
  id: string;
  sha256: string;
  date: string;
  year: number;
  publisher: string;
  page?: string | number | null;
  quality: string;
  matchStatus: string;
  matchedRecordId?: string | null;
  ocrStatus: string;
  ocrHeadline?: string | null;
  ocrExcerpt?: string | null;
  ocrText?: string | null;
  ocrConfidence?: number | null;
  ocrEngine?: string | null;
  ocrModel?: string | null;
  ocrReviewStatus?: string | null;
  thumbnailUrl: string;
  originalImageUrl?: string;
  enhancedImageUrl?: string;
  originalFilename: string;
  duplicateFilenames?: string[];
  reviewDecision?: string | null;
  publicSourceUrl?: string | null;
  publicSourceTitle?: string | null;
  sourceSearchStatus?: string | null;
  language?: string;
  presence?: string;
  uploaded?: boolean;
  uploadedAt?: string;
  status?: string;
};

type Fields = {
  publisher: string;
  publicationDate: string;
  page: string;
  language: string;
  headline: string;
  ocrText: string;
  ocrConfidence: number;
  presence: string;
  notes: string;
  sourceUrl: string;
};

type Props = {
  onClose: () => void;
  onSaved: (record: UploadedClipping) => void;
};

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const publishers = [
  ['Sakal', ['sakal', 'सकाळ']],
  ['Loksatta', ['loksatta', 'लोकसत्ता']],
  ['Maharashtra Times', ['maharashtra times', 'महाराष्ट्र टाइम्स']],
  ['Pudhari', ['pudhari', 'पुढारी']],
  ['Kesari', ['kesari', 'केसरी']],
  ['Lokmat', ['lokmat', 'लोकमत']],
  ['The Times of India', ['times of india']],
  ['The Indian Express', ['indian express']],
  ['Hindustan Times', ['hindustan times']],
  ['Business Standard', ['business standard']],
] as const;

const emptyFields = (): Fields => ({
  publisher: '',
  publicationDate: '',
  page: '',
  language: 'Unknown',
  headline: '',
  ocrText: '',
  ocrConfidence: 0,
  presence: 'MCCIA relevance requires review',
  notes: 'Original and enhanced copies preserved; OCR text reviewed during upload.',
  sourceUrl: '',
});

function devanagariDigits(value: string) {
  return value.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
}

function detectDate(text: string) {
  const normalized = devanagariDigits(text);
  const match = normalized.match(/\b([0-3]?\d)[./-]([01]?\d)[./-]((?:19|20)?\d{2})\b/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const candidate = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? '' : candidate;
}

function detectPublisher(text: string) {
  const value = text.toLowerCase();
  return publishers.find(([, markers]) => markers.some((marker) => value.includes(marker)))?.[0] ?? '';
}

function detectLanguage(text: string) {
  const devanagari = (text.match(/[\u0900-\u097f]/g) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  if (devanagari > latin * 0.35) return 'Marathi / Hindi';
  if (latin) return 'English';
  return 'Unknown';
}

function detectPresence(text: string) {
  const value = text.toLowerCase();
  if (['prashant girbane', 'प्रशांत गिरबने', 'प्रशांत गिरबाणे', 'director general', 'महासंचालक'].some((term) => value.includes(term))) {
    return 'Director General / Prashant Girbane mention';
  }
  if (['mccia president', 'president of mccia', 'एमसीसीआयए अध्यक्ष', 'एमसीसीआयएचे अध्यक्ष'].some((term) => value.includes(term))) {
    return 'MCCIA President mention';
  }
  if (['mccia', 'mahratta chamber', 'maratha chamber', 'एमसीसीआयए', 'एमसीसीआईए', 'मराठा चेंबर'].some((term) => value.includes(term))) {
    return 'MCCIA mention';
  }
  return 'MCCIA relevance requires review';
}

function detectPage(text: string) {
  const match = devanagariDigits(text).match(/(?:page|p\.?|पृष्ठ)\s*[:.-]?\s*(\d{1,3})/i);
  return match?.[1] ?? '';
}

function detectHeadline(text: string, publisher: string) {
  const publisherValue = publisher.toLowerCase();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12 && line.length <= 220)
    .filter((line) => !/^\W*[\d०-९][\d०-९ ./:-]+$/.test(line))
    .filter((line) => !publisherValue || !line.toLowerCase().includes(publisherValue));
  return lines.sort((a, b) => {
    const aLetters = (a.match(/[a-z\u0900-\u097f]/gi) || []).length;
    const bLetters = (b.match(/[a-z\u0900-\u097f]/gi) || []).length;
    return bLetters - aLetters;
  })[0]?.slice(0, 500) ?? 'Headline requires review';
}

async function enhanceNewspaper(file: File) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(2.5, Math.max(1, 2000 / bitmap.width));
  while (bitmap.width * scale * bitmap.height * scale > 14_000_000) scale *= 0.9;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image enhancement is unavailable in this browser.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  const pixels = width * height;
  const gray = new Uint8Array(pixels);
  const histogram = new Uint32Array(256);
  for (let index = 0, pixel = 0; pixel < pixels; pixel += 1, index += 4) {
    const value = Math.round(image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722);
    gray[pixel] = value;
    histogram[value] += 1;
  }
  const percentile = (fraction: number) => {
    const target = pixels * fraction;
    let seen = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value];
      if (seen >= target) return value;
    }
    return fraction < 0.5 ? 0 : 255;
  };
  const low = percentile(0.015);
  const high = Math.max(low + 35, percentile(0.985));
  const contrasted = new Uint8Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const normalized = ((gray[pixel] - low) * 255) / (high - low);
    contrasted[pixel] = Math.max(0, Math.min(255, Math.round(normalized)));
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const center = contrasted[pixel];
      let sharpened = center;
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const neighbours = contrasted[pixel - 1] + contrasted[pixel + 1] + contrasted[pixel - width] + contrasted[pixel + width];
        sharpened = center + 0.34 * (center * 4 - neighbours);
      }
      const value = Math.max(0, Math.min(255, Math.round(sharpened)));
      const index = pixel * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Unable to create the enhanced image.'))), 'image/webp', 0.94),
  );
  return { blob, width, height };
}

export default function ClippingIngest({ onClose, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState('');
  const [enhancedBlob, setEnhancedBlob] = useState<Blob | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [selectedLanguages, setSelectedLanguages] = useState(['eng', 'mar', 'hin']);
  const [stage, setStage] = useState<'idle' | 'enhancing' | 'ocr' | 'review' | 'saving' | 'saved'>('idle');
  const [progress, setProgress] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);
  useEffect(() => () => { if (enhancedUrl) URL.revokeObjectURL(enhancedUrl); }, [enhancedUrl]);

  const updateField = <Key extends keyof Fields>(key: Key, value: Fields[Key]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const runPipeline = async (file: File) => {
    setError('');
    setMessage('');
    setReviewed(false);
    setProgress(0);
    if (!acceptedTypes.has(file.type)) {
      setError('Choose a JPG, PNG or WebP newspaper clipping.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('The clipping must be smaller than 20 MB.');
      return;
    }
    setOriginalFile(file);
    setOriginalUrl(URL.createObjectURL(file));
    setEnhancedBlob(null);
    setEnhancedUrl('');
    setFields(emptyFields());
    try {
      setStage('enhancing');
      const enhanced = await enhanceNewspaper(file);
      setEnhancedBlob(enhanced.blob);
      setEnhancedUrl(URL.createObjectURL(enhanced.blob));
      setDimensions({ width: enhanced.width, height: enhanced.height });

      setStage('ocr');
      const languageModel = selectedLanguages.length ? selectedLanguages.join('+') : 'eng';
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(languageModel, undefined, {
        logger: (status) => {
          if (status.status === 'recognizing text') setProgress(Math.round((status.progress || 0) * 100));
        },
      });
      try {
        const result = await worker.recognize(enhanced.blob);
        const text = result.data.text.replace(/\n{3,}/g, '\n\n').trim();
        const publisher = detectPublisher(text);
        setFields({
          publisher,
          publicationDate: detectDate(text),
          page: detectPage(text),
          language: detectLanguage(text),
          headline: detectHeadline(text, publisher),
          ocrText: text,
          ocrConfidence: Math.round(result.data.confidence || 0),
          presence: detectPresence(text),
          notes: 'Original and enhanced copies preserved; OCR text reviewed during upload.',
          sourceUrl: '',
        });
      } finally {
        await worker.terminate();
      }
      setStage('review');
      setMessage('Enhancement and OCR complete. Correct any fields below, then confirm your review.');
    } catch (pipelineError) {
      setStage('idle');
      setError(pipelineError instanceof Error ? pipelineError.message : 'The clipping could not be processed.');
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void runPipeline(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void runPipeline(file);
  };

  const toggleLanguage = (language: string) => {
    setSelectedLanguages((current) => current.includes(language) ? current.filter((item) => item !== language) : [...current, language]);
  };

  const downloadEnhanced = () => {
    if (!enhancedUrl || !originalFile) return;
    const link = document.createElement('a');
    link.href = enhancedUrl;
    link.download = `${originalFile.name.replace(/\.[^.]+$/, '')}-enhanced.webp`;
    link.click();
  };

  const save = async () => {
    if (!originalFile || !enhancedBlob || !fields.ocrText || !fields.publicationDate || !reviewed) return;
    setStage('saving');
    setError('');
    try {
      const form = new FormData();
      form.append('original', originalFile, originalFile.name);
      form.append('enhanced', enhancedBlob, `${originalFile.name.replace(/\.[^.]+$/, '')}-enhanced.webp`);
      form.append('metadata', JSON.stringify({
        ...fields,
        ocrLanguages: selectedLanguages.join('+') || 'eng',
        width: dimensions.width,
        height: dimensions.height,
        reviewed,
      }));
      const response = await fetch('/api/uploads', { method: 'POST', body: form });
      const payload = await response.json() as { record?: UploadedClipping; duplicate?: boolean; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error || 'The clipping could not be saved.');
      onSaved(payload.record);
      setStage('saved');
      setMessage(payload.duplicate ? 'This clipping already exists; the saved record has been opened in the archive.' : 'Clipping saved with its original image, enhanced image and reviewed OCR text.');
    } catch (saveError) {
      setStage('review');
      setError(saveError instanceof Error ? saveError.message : 'The clipping could not be saved.');
    }
  };

  return <section className="ingest-panel" id="add-clipping" aria-labelledby="ingest-title">
    <div className="ingest-heading"><div><p className="kicker">NEW EVIDENCE / OWNER WORKSPACE</p><h2 id="ingest-title">Add a newspaper clipping</h2><p>Original evidence stays untouched. A separate OCR copy is enlarged, converted to grayscale, auto-contrasted and sharpened.</p></div><button className="ingest-close" onClick={onClose} aria-label="Close clipping uploader">Close</button></div>
    <div className="ingest-languages" aria-label="OCR languages"><strong>OCR languages</strong>{[['eng','English'],['mar','Marathi'],['hin','Hindi']].map(([code,label])=><label key={code}><input type="checkbox" checked={selectedLanguages.includes(code)} onChange={()=>toggleLanguage(code)}/><span>{label}</span></label>)}</div>
    <div className="drop-zone" role="button" tabIndex={0} onClick={()=>inputRef.current?.click()} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();inputRef.current?.click()}}} onDragOver={event=>event.preventDefault()} onDrop={handleDrop}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInput}/><strong>{originalFile?'Choose a different clipping':'Drop a clipping here or choose an image'}</strong><span>JPG, PNG or WebP · maximum 20 MB · clearer source images produce better OCR</span>
    </div>
    {error&&<div className="ingest-alert ingest-error" role="alert">{error}</div>}
    {message&&<div className="ingest-alert ingest-success" role="status">{message}</div>}
    {(stage==='enhancing'||stage==='ocr'||stage==='saving')&&<div className="ingest-progress"><div><span style={{width:`${stage==='enhancing'?18:stage==='saving'?100:Math.max(24,progress)}%`}}/></div><strong>{stage==='enhancing'?'Creating a clear OCR copy…':stage==='ocr'?`Reading English, Marathi and Hindi text… ${progress}%`:'Saving original, enhanced copy and metadata…'}</strong></div>}
    {originalUrl&&enhancedUrl&&<div className="image-comparison"><figure><div><img src={originalUrl} alt="Original uploaded newspaper clipping"/></div><figcaption><strong>Original evidence</strong><span>Preserved without changes</span></figcaption></figure><figure><div><img src={enhancedUrl} alt="Enhanced OCR copy of the newspaper clipping"/></div><figcaption><strong>Enhanced OCR copy</strong><span>{dimensions.width.toLocaleString('en-IN')} × {dimensions.height.toLocaleString('en-IN')} px</span><button onClick={downloadEnhanced}>Download enhanced</button></figcaption></figure></div>}
    {(stage==='review'||stage==='saving'||stage==='saved')&&<div className="ingest-review"><div className="review-heading"><div><strong>Review extracted information</strong><span>OCR is evidence assistance, not final fact verification.</span></div><span className="confidence-score">OCR confidence {fields.ocrConfidence}%</span></div><div className="review-fields"><label>News channel / publisher<input value={fields.publisher} onChange={event=>updateField('publisher',event.target.value)} placeholder="Publisher not identified"/></label><label>Publication date<input type="date" required value={fields.publicationDate} onChange={event=>updateField('publicationDate',event.target.value)}/></label><label>Page<input value={fields.page} onChange={event=>updateField('page',event.target.value)} placeholder="Optional"/></label><label>Language<input value={fields.language} onChange={event=>updateField('language',event.target.value)}/></label><label className="field-wide">Headline<input value={fields.headline} onChange={event=>updateField('headline',event.target.value)}/></label><label className="field-wide">People / organisation<select value={fields.presence} onChange={event=>updateField('presence',event.target.value)}><option>MCCIA mention</option><option>Director General / Prashant Girbane mention</option><option>MCCIA President mention</option><option>MCCIA relevance requires review</option></select></label><label className="field-wide">Public source URL, if known<input type="url" value={fields.sourceUrl} onChange={event=>updateField('sourceUrl',event.target.value)} placeholder="https://publisher.example/article"/></label><label className="field-wide">Full OCR text<textarea rows={12} value={fields.ocrText} onChange={event=>updateField('ocrText',event.target.value)}/></label><label className="field-wide">Review note<textarea rows={3} value={fields.notes} onChange={event=>updateField('notes',event.target.value)}/></label></div><label className="review-confirm"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} disabled={stage==='saved'}/><span>I checked the enhanced image against the extracted headline, date, publisher and OCR text.</span></label><div className="ingest-actions"><button className="button-secondary" onClick={downloadEnhanced}>Download enhanced copy</button><button className="button-primary" onClick={save} disabled={!reviewed||!fields.ocrText||!fields.publicationDate||stage==='saving'||stage==='saved'}>{stage==='saved'?'Saved to clipping evidence':stage==='saving'?'Saving…':'Save reviewed clipping'}</button></div></div>}
  </section>;
}
