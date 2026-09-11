const MI = Object.freeze({
  formId: '1RhQNG2vzrBuyIEdIgEKXPBqfRi-GOrjLhWg34TibB5Q',
  archiveFolderId: '105kcn3EBPbTF8Iy5JkWudlG7FUMmeGps',
  spreadsheetId: '16O4eViZ9I7y8YbUaaPt3jMjfQW9nvdaOAHAPtw0NAgA',
  dashboardUrl: 'https://mccia-media.vercel.app',
  ownerEmail: 'mccianewsclipping@gmail.com',
  storage: 'drive',
  fields: Object.freeze({
    date: 'Clipping / publication date', publisher: 'Publisher / news channel',
    edition: 'Edition / city', mediaType: 'Media type',
    presence: 'People / organisation mentioned', headline: 'Headline / title',
    language: 'Language', sourceUrl: 'Source URL', page: 'Page number',
    evidence: 'Upload clipping / evidence', notes: 'Description / notes',
    submittedBy: 'Submitted by',
  }),
  sheets: Object.freeze({
    submissions: 'Submissions', audit: 'Audit Log', errors: 'Errors',
    config: 'Configuration', sources: 'Source Monitoring', analytics: 'Analytics',
  }),
  statuses: Object.freeze(['Processing', 'Auto-published', 'Delivery failed', 'Withdrawn', 'OCR retry pending']),
  dgClassifications: Object.freeze([
    'Post/article written by DG Sir',
    'Quote given by DG Sir',
    'Conversation with DG Sir',
  ]),
  queries: Object.freeze([
    'MCCIA', '"Prashant Girbane"', '"Mahratta Chamber of Commerce"',
    '"Maratha Chamber of Commerce" Pune', 'MCCIA president', 'एमसीसीआयए',
    '"प्रशांत गिरबने"', '"प्रशांत गिरबाणे"',
  ]),
});

const MI_SUBMISSION_HEADERS = [
  'Record ID', 'Form response ID', 'Form timestamp', 'Processed at',
  'Publication date', 'Year', 'Month', 'Publisher', 'Edition / city', 'Media type',
  'People / organisation', 'Headline', 'Language', 'Source URL', 'Page number',
  'Description / notes', 'Submitted by', 'Submitter email', 'Original filename',
  'Archived filename', 'MIME type', 'File size', 'Drive file ID', 'Drive file URL',
  'Drive folder URL', 'Binary SHA-256', 'OCR text', 'OCR confidence', 'OCR engine',
  'Duplicate score', 'Duplicate record ID', 'Duplicate reasons', 'Link status',
  'Link HTTP status', 'Last link check', 'Verification status', 'Processing status',
  'Reviewer', 'Reviewed at', 'Dashboard inbox ID', 'Approved record ID',
  'Dashboard status', 'Error message', 'Updated at', 'DG content classification', 'Topic', 'OCR attempts', 'OCR next attempt', 'OCR text file ID',
];
const MI_AUDIT_HEADERS = ['Timestamp', 'Record ID', 'Action', 'Actor', 'Previous status', 'New status', 'Details', 'Source'];
const MI_ERROR_HEADERS = ['Timestamp', 'Stage', 'Record ID', 'Form response ID', 'Drive file ID', 'Error message', 'Stack', 'Resolved', 'Resolved by', 'Resolved at'];
const MI_SOURCE_HEADERS = ['Source ID', 'Discovered at', 'Publication date', 'Publisher', 'Title', 'Language', 'People / organisation', 'Topic', 'Source URL', 'Discovery type', 'Query / feed', 'HTTP status', 'Link status', 'Last checked', 'Verification status', 'Dashboard status', 'Notes', 'DG content classification'];

function setupMcciaMediaIntelligence() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== MI.ownerEmail) throw new Error('Sign in as ' + MI.ownerEmail + ' before running setup.');
  const form = FormApp.openById(MI.formId);
  miValidateForm_(form);
  DriveApp.getFolderById(MI.archiveFolderId).setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  DriveApp.getFileById(MI.spreadsheetId).setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  miEnsureWorkbook_();
  if (!PropertiesService.getScriptProperties().getProperty('DRIVE_GATEWAY_SECRET')) PropertiesService.getScriptProperties().setProperty('DRIVE_GATEWAY_SECRET',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  miInstallTriggers_(form);
  rebuildMcciaAnalytics();
  miAudit_('', 'SYSTEM_SETUP', Session.getEffectiveUser().getEmail(), '', '', 'The complete intake and monitoring pipeline was installed.', 'Apps Script');
  return { form: form.getEditUrl(), responses: form.getPublishedUrl(), sheet: miSpreadsheet_().getUrl(), archive: DriveApp.getFolderById(MI.archiveFolderId).getUrl() };
}

function onMcciaFormSubmit(event) {
  if (!event || !event.response) throw new Error('Run this only from the installed Form submit trigger.');
  const response = event.response;
  const values = miResponseMap_(response);
  const date = miDate_(values[MI.fields.date]);
  const publisher = miClean_(values[MI.fields.publisher], 250) || 'Publisher requires review';
  const actor = response.getRespondentEmail() || miClean_(values[MI.fields.submittedBy], 250) || 'Form respondent';
  const fileIds = miFileIds_(response);
  if (values[MI.fields.date] && !date) { miError_('PUBLICATION_DATE', '', response.getId(), '', new Error('Publication date is invalid or in the future.')); throw new Error('Publication date is invalid or in the future.'); }
  if (!fileIds.length) throw new Error('No uploaded evidence was found.');
  fileIds.forEach(function(fileId, index) {
    let recordId = '';
    try {
      recordId = miProcessFile_(fileId, index + 1, response, values, date, publisher);
      miAudit_(recordId, 'SUBMITTED', actor, '', 'Processing', 'Archived, OCR processed and sent for automatic publication.', 'Google Form');
    } catch (error) { miError_('FORM_SUBMIT', recordId, response.getId(), fileId, error); }
  });
  rebuildMcciaAnalytics();
}

function miProcessFile_(fileId, sequence, response, values, date, publisher) {
  const file = DriveApp.getFileById(fileId);
  const originalName = file.getName();
  const mime = file.getMimeType() || 'application/octet-stream';
  const size = file.getSize();
  const sha = miSha_(file.getBlob().getBytes());
  const recordId = 'INT-' + sha.slice(0, 12).toUpperCase();
  const folder = miArchiveFolder_(date);
  const archivedName = miFilename_(date, publisher, sequence, originalName);
  file.moveTo(folder);
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  file.setName(archivedName);
  const ocr = miOcr_(file, mime, values[MI.fields.language]);
  const headline = miClean_(values[MI.fields.headline], 500) || miHeadline_(ocr.text) || publisher + ' clipping';
  const duplicate = miDuplicate_({ recordId: recordId, sha: sha, date: date, publisher: publisher, headline: headline, ocr: ocr.text, size: size });
  const sourceUrl = miUrl_(values[MI.fields.sourceUrl]);
  const link = sourceUrl ? miCheckUrl_(sourceUrl) : { status: 'Missing', code: '' };
  const now = new Date();
  const metadata = {
    recordId: recordId, formTimestamp: response.getTimestamp().toISOString(),
    formResponseId: response.getId(), driveFileId: file.getId(),
    driveFileUrl: file.getUrl(), driveFolderUrl: folder.getUrl(),
    submitterEmail: response.getRespondentEmail() || '', publicationDate: date,
    publisher: publisher, editionCity: miClean_(values[MI.fields.edition], 200),
    mediaType: miClean_(values[MI.fields.mediaType], 100) || miMediaType_(mime),
    page: miClean_(values[MI.fields.page], 50),
    language: miMetadataValue_(values[MI.fields.language], miLanguage_(ocr.text || headline)),
    headline: headline,
    presence: miMetadataValue_(values[MI.fields.presence], miPresence_(headline + ' ' + ocr.text)),
    notes: miClean_(values[MI.fields.notes], 3000), sourceUrl: sourceUrl,
    ocrText: ocr.text, ocrConfidence: ocr.confidence, ocrEngine: ocr.engine,
    duplicateScore: duplicate.score, duplicateRecordId: duplicate.recordId,
    duplicateReasons: duplicate.reasons.join('; '), linkStatus: link.status,
    linkHttpStatus: link.code,
  };
  metadata.dgEngagementType = miDgClassification_([headline, ocr.text].join(' '));
  metadata.topic = miTopic_(headline + ' ' + ocr.text);
  const sheet = miSheet_(MI.sheets.submissions);
  const rowLock=LockService.getScriptLock();rowLock.waitLock(30000);let row;
  try { sheet.appendRow(miSafeRow_([
    recordId, response.getId(), response.getTimestamp(), now, date, date ? Number(date.slice(0, 4)) : '', miMonthLabel_(date),
    publisher, metadata.editionCity, metadata.mediaType, metadata.presence, headline, metadata.language,
    sourceUrl, metadata.page, metadata.notes, miClean_(values[MI.fields.submittedBy], 250), metadata.submitterEmail,
    originalName, archivedName, mime, size, file.getId(), file.getUrl(), folder.getUrl(), sha,
    ocr.text.slice(0,45000), ocr.confidence, ocr.engine, duplicate.score, duplicate.recordId, duplicate.reasons.join('; '),
    link.status, link.code, sourceUrl ? now : '', duplicate.score >= 0.72 ? 'Potential duplicate — verify' : 'Unverified',
    'Processing', '', '', '', '', 'Pending dashboard delivery', '', now, metadata.dgEngagementType, metadata.topic, 1, ocr.error ? new Date(Date.now()+5*60000) : '', ocr.text ? folder.createFile(recordId+'-ocr.txt',ocr.text,MimeType.PLAIN_TEXT).getId() : '',
  ]));
  row = sheet.getLastRow(); } finally { rowLock.releaseLock(); }
  metadata.sheetRow = row;
  miValidation_(sheet, row, 1);
  if (ocr.error) { sheet.getRange(row,37).setValue(miSafeCell_('OCR retry pending'));sheet.getRange(row,43).setValue(miSafeCell_(ocr.error));miReportHealth_();return recordId; }
  const delivery = miSendIntake_(file, metadata);
  sheet.getRange(row, 37).setValue(miSafeCell_(delivery.error ? 'Delivery failed' : delivery.publishedId ? 'Auto-published' : 'Withdrawn'));
  sheet.getRange(row, 40, 1, 4).setValues(miSafeRows_([[delivery.id, delivery.publishedId || '', delivery.status, delivery.error]]));
  sheet.getRange(row, 44).setValue(miSafeCell_(new Date()));
  return recordId;
}

function runWeeklyDiscovery() { return runDailyDiscovery(); }

function runDailyDiscovery() {
  const now = new Date();
  let records = [];
  MI.queries.forEach(function(query) {
    try { records = records.concat(miFeed_(miGoogleNewsUrl_(query), 'Google News RSS', query, now)); }
    catch (error) { miError_('GOOGLE_NEWS_RSS', '', '', '', error); }
  });
  [
    { label: 'MCCIA website RSS', url: 'https://www.mcciapune.com/feed/' },
    { label: 'MCCIA Sampada archive', url: 'https://www.mcciapune.com/publications/publication-sampada/' },
  ].forEach(function(feed) {
    try {
      const found = miFeed_(feed.url, 'RSS / e-paper portal', feed.label, now);
      records = records.concat(found.length ? found : [miPortalRecord_(feed, now)]);
    } catch (error) { records.push(miPortalRecord_(feed, now)); }
  });
  miUpsertSources_(records);
  rebuildMcciaAnalytics();
  miAudit_('', 'WEEKLY_DISCOVERY', Session.getEffectiveUser().getEmail(), '', '', records.length + ' source candidates processed.', 'Time trigger');
}

function monitorSourceLinks() {
  const now = new Date();
  miCheckRows_(miSheet_(MI.sheets.sources), 9, 12, 13, 14, now);
  miCheckRows_(miSheet_(MI.sheets.submissions), 14, 34, 33, 35, now);
  rebuildMcciaAnalytics();
  miAudit_('', 'LINK_MONITOR', Session.getEffectiveUser().getEmail(), '', '', 'Public source URLs checked and broken links flagged.', 'Time trigger');
}

function rebuildMcciaAnalytics() {
  const submissions = miObjects_(miSheet_(MI.sheets.submissions));
  const sources = miObjects_(miSheet_(MI.sheets.sources));
  const sheet = miSheet_(MI.sheets.analytics);
  const count = function(items, key) { return items.reduce(function(out, row) { const value = miClean_(row[key], 250) || 'Unknown'; out[value] = (out[value] || 0) + 1; return out; }, {}); };
  const rows = [
    ['MCCIA MEDIA INTELLIGENCE — LIVE OPERATIONS', 'Count'],
    ['Total form evidence', submissions.length],
    ['Automatically published', submissions.filter(function(r) { return r['Processing status'] === 'Auto-published'; }).length],
    ['Delivery errors', submissions.filter(function(r) { return r['Processing status'] === 'Delivery failed'; }).length],
    ['Potential duplicates', submissions.filter(function(r) { return Number(r['Duplicate score']) >= 0.72; }).length],
    ['OCR completed', submissions.filter(function(r) { return Boolean(r['OCR text']); }).length],
    ['Broken source links', submissions.concat(sources).filter(function(r) { return r['Link status'] === 'Broken'; }).length],
    ['Discovered source candidates', sources.length], ['', ''],
  ];
  [['Processing status', 'Processing status', submissions], ['DG content classification', 'DG content classification', submissions.concat(sources)], ['People / organisation', 'People / organisation', submissions], ['Language', 'Language', submissions], ['Publisher', 'Publisher', submissions]].forEach(function(group) {
    rows.push([group[0], 'Count']);
    const values = count(group[2], group[1]);
    Object.keys(values).sort(function(a, b) { return values[b] - values[a]; }).slice(0, 30).forEach(function(key) { rows.push([key, values[key]]); });
    rows.push(['', '']);
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(miSafeRows_(rows));
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#194d36').setFontColor('#ffffff');
  sheet.autoResizeColumn(1); sheet.setColumnWidth(2, 110);
}

function miEnsureWorkbook_() {
  const ss = miSpreadsheet_();
  miEnsureSheet_(ss, MI.sheets.submissions, MI_SUBMISSION_HEADERS);
  miEnsureSheet_(ss, MI.sheets.audit, MI_AUDIT_HEADERS);
  miEnsureSheet_(ss, MI.sheets.errors, MI_ERROR_HEADERS);
  const sources = miEnsureSheet_(ss, MI.sheets.sources, MI_SOURCE_HEADERS);
  miEnsureSheet_(ss, MI.sheets.analytics, ['Metric', 'Count']);
  const config = miEnsureSheet_(ss, MI.sheets.config, ['Setting', 'Value', 'Purpose']);
  const configRows = [
    ['Setting', 'Value', 'Purpose'], ['Form ID', MI.formId, 'MCCIA team collection form'],
    ['Archive folder ID', MI.archiveFolderId, 'Permanent Year / Month archive'],
    ['Dashboard URL', MI.dashboardUrl, 'Automatic upload publication and archive'],
    ['Daily discovery', 'Daily around 08:45 Asia/Kolkata', 'Google News, RSS and e-paper search'],
    ['Daily link checks', '06:00 Asia/Kolkata', 'Broken-source monitoring'],
    ['Duplicate threshold', '0.72', 'Headline, date and image-content score'],
    ['Upload workflow', 'Processing → Auto-published', 'No manual approval; automatic metadata stays unverified'],
    ['Owner', MI.ownerEmail, 'Authorized Apps Script identity'],
  ];
  config.clearContents(); config.getRange(1, 1, configRows.length, 3).setValues(miSafeRows_(configRows)); miStyle_(config, 3);
  const submissions = ss.getSheetByName(MI.sheets.submissions);
  miValidation_(submissions, 2, Math.max(1, submissions.getMaxRows() - 1));
  miDgValidation_(sources, 2, Math.max(1, sources.getMaxRows() - 1), 18);
}

function miInstallTriggers_(form) {
  const handlers = ['onMcciaFormSubmit', 'onMcciaSheetEdit', 'runWeeklyDiscovery', 'runDailyDiscovery', 'monitorSourceLinks', 'retryMcciaDeliveries'];
  ScriptApp.getProjectTriggers().forEach(function(trigger) { if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('onMcciaFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('retryMcciaDeliveries').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('runDailyDiscovery').timeBased().everyDays(1).atHour(8).nearMinute(45).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('monitorSourceLinks').timeBased().everyDays(1).atHour(6).create();
}

function miValidateForm_(form) {
  const titles = form.getItems().map(function(item) { return item.getTitle(); });
  form.getItems().forEach(function(item) { if ([MI.fields.language, MI.fields.presence].indexOf(item.getTitle()) < 0) return; const type = item.getType(); if (type === FormApp.ItemType.TEXT) item.asTextItem().setRequired(false); else if (type === FormApp.ItemType.LIST) item.asListItem().setRequired(false); else if (type === FormApp.ItemType.MULTIPLE_CHOICE) item.asMultipleChoiceItem().setRequired(false); else if (type === FormApp.ItemType.CHECKBOX) item.asCheckboxItem().setRequired(false); });
  const missing = Object.keys(MI.fields).filter(function(key) { return ['language','presence'].indexOf(key) < 0; }).map(function(key) { return MI.fields[key]; }).filter(function(title) { return titles.indexOf(title) < 0; });
  if (missing.length) throw new Error('The Form is missing: ' + missing.join(', '));
  const uploads = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  if (!uploads.length || uploads[0].getTitle() !== MI.fields.evidence) throw new Error('The evidence File upload question is missing.');
}

function miOcr_(file, mime, language) {
  if (/^video\//i.test(mime)) return { text: '', confidence: '', engine: 'Skipped — video evidence' };
  if (!/^image\//i.test(mime) && mime !== MimeType.PDF) return { text: '', confidence: '', engine: 'Skipped — unsupported OCR format' };
  let tempId = '';
  try {
    const created = Drive.Files.create({ name: 'OCR temporary — ' + file.getName(), mimeType: 'application/vnd.google-apps.document' }, file.getBlob(), Object.assign({fields:'id'}, /^(Marathi|mr)$/i.test(language||'')?{ocrLanguage:'mr'}:/^(Hindi|hi)$/i.test(language||'')?{ocrLanguage:'hi'}:/^(English|en)$/i.test(language||'')?{ocrLanguage:'en'}:{}));
    tempId = created.id; Utilities.sleep(800);
    const text = DocumentApp.openById(tempId).getBody().getText().replace(/\n{3,}/g, '\n\n').trim();
    if (!text.trim()) throw new Error('OCR returned no readable text.');
    return { text: text, confidence: null, engine: 'Google Drive OCR' };
  } catch (error) { miError_('OCR', '', '', file.getId(), error); return { text: '', confidence: null, engine: 'Google Drive OCR failed', error: error.message || 'OCR failed' }; }
  finally { if (tempId) try { DriveApp.getFileById(tempId).setTrashed(true); } catch (ignore) {} }
}

function miDuplicate_(candidate) {
  let best = { score: 0, recordId: '', reasons: [] };
  miObjects_(miSheet_(MI.sheets.submissions)).forEach(function(row) {
    if (!row['Record ID']) return;
    const exact = miClean_(row['Binary SHA-256'], 100) === candidate.sha;
    const date = miClean_(row['Publication date'], 20) === candidate.date ? 1 : 0;
    const headline = miSimilarity_(row['Headline'], candidate.headline);
    const ocr = miSimilarity_(String(row['OCR text'] || '').slice(0, 5000), String(candidate.ocr || '').slice(0, 5000));
    const oldSize = Number(row['File size']) || 0;
    const size = oldSize && candidate.size ? Math.min(oldSize, candidate.size) / Math.max(oldSize, candidate.size) : 0;
    const image = exact ? 1 : ocr * 0.8 + size * 0.2;
    const score = exact ? 1 : Math.min(1, image * 0.45 + headline * 0.30 + date * 0.20 + (miNorm_(row['Publisher']) === miNorm_(candidate.publisher) ? 0.05 : 0));
    const reasons = [];
    if (exact) reasons.push('exact image SHA-256'); else if (image >= 0.72) reasons.push('high OCR/image-content similarity ' + Math.round(image * 100) + '%');
    if (headline >= 0.72) reasons.push('headline similarity ' + Math.round(headline * 100) + '%'); if (date) reasons.push('same publication date');
    if (score > best.score) best = { score: Number(score.toFixed(3)), recordId: row['Record ID'], reasons: reasons };
  });
  return best;
}

function miSendIntake_(file, metadata) {
  try {
    if(MI.storage==='drive'){
      if(file.getSize()>100*1024*1024)throw new Error('Evidence exceeds 100 MB.');
      if(!/^(image\/(jpeg|png|webp)|application\/pdf|video\/(mp4|webm|quicktime))$/.test(file.getMimeType()))throw new Error('Unsupported evidence type.');
      if((/^image\//.test(file.getMimeType())||file.getMimeType()===MimeType.PDF)&&!String(metadata.ocrText||'').trim())throw new Error('OCR must finish before publication.');
      if(metadata.publicationDate&&!miDate_(metadata.publicationDate))throw new Error('Invalid publication date.');
      const id='AUTO-'+miSha_(file.getBlob().getBytes()).slice(0,12).toUpperCase();
      if(miObjects_(miSheet_(MI.sheets.submissions)).some(function(row){return row['Approved record ID']===id&&['Withdrawn','Rejected'].indexOf(row['Processing status'])>=0}))return {id:'',publishedId:'',status:'Withdrawn',error:''};
      return {id:'',publishedId:id,status:'Auto-published',error:''};
    }
    if (file.getSize() > 100 * 1024 * 1024) throw new Error('Evidence exceeds the 100 MB collection limit.');
    const bytes = file.getBlob().getBytes();
    const start = miFetch_(MI.dashboardUrl + '/api/evidence-transfer', {method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({mode:'intake',metadata:metadata,files:{file:{name:file.getName(),type:file.getMimeType(),size:bytes.length,sha256:miSha_(bytes)}}})});
    const session = miJson_(start.getContentText()) || {};
    if (start.getResponseCode() !== 201 || !session.id || !session.chunkBytes) throw new Error(session.error || 'Unable to start evidence transfer.');
    for (let offset = 0; offset < bytes.length; offset += session.chunkBytes) {
      const chunk = Utilities.newBlob(bytes.slice(offset,offset+session.chunkBytes),'application/octet-stream');
      let sent = false;
      for(let attempt=0;attempt<3;attempt++){
        const part = miFetch_(MI.dashboardUrl+'/api/evidence-transfer/'+session.id+'?file=file&part='+(offset/session.chunkBytes),{method:'put',contentType:'application/octet-stream',payload:chunk,muteHttpExceptions:true});
        if(part.getResponseCode()===200){sent=true;break;}
      }
      if(!sent)throw new Error('Evidence transfer interrupted at part '+(offset/session.chunkBytes)+'. Retry delivery.');
    }
    const response = miFetch_(MI.dashboardUrl+'/api/evidence-transfer/'+session.id,{method:'post',muteHttpExceptions:true});
    const body = miJson_(response.getContentText()) || {};
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(body.error || ('HTTP ' + response.getResponseCode()));
    return { id: body.record && body.record.id || '', publishedId: body.publishedId || '', status: body.publishedId ? (body.duplicate ? 'Duplicate connected' : 'Auto-published') : 'Withdrawn', error: '' };
  } catch (error) { return { id: '', status: 'Delivery failed', error: error.message || String(error) }; }
}

function miFetch_(url, options) {
  const request = Object.assign({}, options || {});
  request.headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() });
  const secret = PropertiesService.getScriptProperties().getProperty('GOOGLE_FORM_INTAKE_SECRET');
  if (secret) request.headers['x-mccia-intake-secret'] = secret;
  return UrlFetchApp.fetch(url, request);
}

// Retry failed deliveries and finish previously delivered legacy submissions.
// Existing evidence is processed by ID; it does not need another binary upload.
function retryMcciaDeliveries() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const sheet = miSheet_(MI.sheets.submissions);
    const candidates = [];
    for (let number=2; number<=sheet.getLastRow(); number++) {
      const row = miRow_(sheet,number);
      if (!row['Drive file ID'] || ['Auto-published','Withdrawn','Rejected'].indexOf(row['Processing status'])>=0) continue;
      if (new Date(row['OCR next attempt']).getTime() > Date.now()) continue;
      const updated = new Date(row['Updated at']).getTime() || 0;
      if (Date.now()-updated < 5*60*1000) continue;
      candidates.push({number:number,row:row,updated:updated});
    }
    candidates.sort(function(a,b){return a.updated-b.updated;});
    candidates.slice(0,3).forEach(function(candidate){
      const row=candidate.row, number=candidate.number;
      sheet.getRange(number,44).setValue(miSafeCell_(new Date()));
      let result;
      try {
        if (!String(row['OCR text']||'').trim() && /^(image\/|application\/pdf)/.test(row['MIME type']||'')) {
          const attempts=Number(row['OCR attempts']||0)+1;sheet.getRange(number,47).setValue(miSafeCell_(attempts));
          const ocr=miOcr_(DriveApp.getFileById(row['Drive file ID']),row['MIME type'],row['Language']);
          if(ocr.error){sheet.getRange(number,37).setValue(miSafeCell_('OCR retry pending'));sheet.getRange(number,43).setValue(miSafeCell_(ocr.error));sheet.getRange(number,48).setValue(miSafeCell_(new Date(Date.now()+Math.min(24*60,5*Math.pow(2,Math.min(attempts,9)))*60000)));return;}
          row['OCR text']=ocr.text;row['OCR engine']=ocr.engine;sheet.getRange(number,27).setValue(miSafeCell_(ocr.text.slice(0,45000)));sheet.getRange(number,49).setValue(miSafeCell_(DriveApp.getFolderById(MI.archiveFolderId).createFile(row['Record ID']+'-ocr.txt',ocr.text,MimeType.PLAIN_TEXT).getId()));sheet.getRange(number,29).setValue(miSafeCell_(ocr.engine));sheet.getRange(number,48).setValue(miSafeCell_(''));
          const detected=detectMediaMetadata(row['Headline']+' '+ocr.text);row['Language']=miMetadataValue_(row['Language'],detected.language);row['People / organisation']=miMetadataValue_(row['People / organisation'],detected.presence);row['DG content classification']=detected.dgEngagementType||'';
          sheet.getRange(number,13).setValue(miSafeCell_(row['Language']));sheet.getRange(number,11).setValue(miSafeCell_(row['People / organisation']));sheet.getRange(number,45).setValue(miSafeCell_(row['DG content classification']));sheet.getRange(number,46).setValue(miSafeCell_(detected.topic));
        }
        if (row['Dashboard inbox ID'] && MI.storage!=='drive') {
          const response=miFetch_(MI.dashboardUrl+'/api/form-intake/'+encodeURIComponent(row['Dashboard inbox ID'])+'/auto-publish',{method:'post',muteHttpExceptions:true});
          const body=miJson_(response.getContentText())||{};
          if(response.getResponseCode()!==200)throw new Error(body.error||'Automatic publication failed.');
          result={id:row['Dashboard inbox ID'],publishedId:body.publishedId||'',status:body.publishedId?'Auto-published':'Withdrawn',error:''};
        } else {
          const date=miDate_(row['Publication date']);
          if(row['Publication date']&&!date)throw new Error('Publication date is invalid or in the future.');
          result=miSendIntake_(DriveApp.getFileById(row['Drive file ID']),{
            publicationDate:date,publisher:row['Publisher'],headline:row['Headline'],language:row['Language'],presence:row['People / organisation'],page:row['Page number'],sourceUrl:row['Source URL'],
            ocrText:row['OCR text'],ocrConfidence:row['OCR confidence']||null,ocrEngine:row['OCR engine'],mediaType:row['Media type'],editionCity:row['Edition / city'],
            formResponseId:row['Form response ID'],driveFileId:row['Drive file ID'],driveFileUrl:row['Drive file URL'],driveFolderUrl:row['Drive folder URL'],submitterEmail:row['Submitter email'],notes:row['Description / notes'],sheetRow:number,
            duplicateScore:row['Duplicate score'],duplicateRecordId:row['Duplicate record ID'],duplicateReasons:row['Duplicate reasons'],dgEngagementType:miDgValue_(row['DG content classification'])
          });
        }
      } catch(error) {result={id:row['Dashboard inbox ID']||'',publishedId:'',status:'Delivery failed',error:error.message||String(error)};}
      sheet.getRange(number,37).setValue(miSafeCell_(result.error?'Delivery failed':result.publishedId?'Auto-published':'Withdrawn'));
      sheet.getRange(number,40,1,4).setValues(miSafeRows_([[result.id,result.publishedId||'',result.status,result.error]]));
    });
    rebuildMcciaAnalytics();miReportHealth_();
  } finally {lock.releaseLock();}
}

function miGoogleNewsUrl_(query) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:8d') + '&hl=en-IN&gl=IN&ceid=IN:en'; }

function miRelevantHeadline_(title) { const text = ' ' + String(title).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim() + ' '; return ['mccia','mahratta chamber','maratha chamber','prashant girbane','प्रशांत गिरबने','प्रशांत गिरबाणे','प्रशांत गिरबणे','एमसीसीआयए','एमसीसीआईए','मराठा चेंबर'].some(function(marker) { return text.indexOf(' ' + marker + ' ') >= 0; }); }

function miFeed_(url, type, query, now) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) throw new Error(query + ' returned HTTP ' + response.getResponseCode());
  const document = XmlService.parse(response.getContentText());
  const elements = document.getRootElement().getDescendants().map(function(value) { return value.asElement && value.asElement(); }).filter(Boolean);
  return elements.filter(function(item) { return ['item', 'entry'].indexOf(item.getName().toLowerCase()) >= 0; }).slice(0, 50).map(function(item) {
    const child = function(name) { const found = item.getChildren().filter(function(value) { return value.getName().toLowerCase() === name.toLowerCase(); })[0]; return found ? found.getText().trim() : ''; };
    let link = child('link');
    if (!link) { const element = item.getChildren().filter(function(value) { return value.getName().toLowerCase() === 'link'; })[0]; link = element && element.getAttribute('href') ? element.getAttribute('href').getValue() : ''; }
    const title = child('title'); const date = miDate_(child('pubDate') || child('published') || child('updated'));
    return { id: miSourceId_(link, title), discoveredAt: now, date: date, publisher: child('source') || miPublisher_(title) || 'Publisher not recorded', title: title, language: miLanguage_(title), presence: miPresence_(title), topic: miTopic_(title), url: link, discoveryType: type, query: query, notes: 'Automated discovery; editorial verification required.', dgEngagementType: miDgClassification_(title) };
  }).filter(function(item) { return item.title && miUrl_(item.url) && miRelevantHeadline_(item.title); });
}

function miPortalRecord_(feed, now) { return { id: miSourceId_(feed.url, feed.label), discoveredAt: now, date: '', publisher: feed.label, title: feed.label + ' source requires manual review', language: 'Language not recorded', presence: 'MCCIA', topic: 'E-paper / publisher portal', url: feed.url, discoveryType: 'E-paper / publisher portal', query: feed.label, notes: 'Public portal monitored; page-level search may require editorial review.', dgEngagementType: '' }; }

function miUpsertSources_(records) {
  const sheet = miSheet_(MI.sheets.sources); const byUrl = {};
  miObjects_(sheet).forEach(function(row, index) { if (row['Source URL']) byUrl[row['Source URL']] = index + 2; });
  records.forEach(function(record) {
    const link = miCheckUrl_(record.url);
    const existingRow = byUrl[record.url] || 0;
    const manualClassification = existingRow ? miDgValue_(sheet.getRange(existingRow, 18).getDisplayValue()) : '';
    const dgEngagementType = manualClassification || miDgValue_(record.dgEngagementType) || miDgClassification_([record.title, record.notes, record.presence].join(' '));
    const values = [record.id, record.discoveredAt, record.date, record.publisher, record.title, record.language, record.presence, record.topic, record.url, record.discoveryType, record.query, link.code, link.status, new Date(), 'Unverified', 'Pending dashboard delivery', record.notes, dgEngagementType];
    if (existingRow) sheet.getRange(existingRow, 1, 1, MI_SOURCE_HEADERS.length).setValues(miSafeRows_([values])); else { sheet.appendRow(miSafeRow_(values)); byUrl[record.url] = sheet.getLastRow(); miDgValidation_(sheet, byUrl[record.url], 1, 18); }
    try { if(MI.storage!=='drive')miFetch_(MI.dashboardUrl + '/api/source-monitoring', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(Object.assign({}, record, { linkStatus: link.status, httpStatus: link.code, dgEngagementType: dgEngagementType })) }); } catch (error) { miError_('SOURCE_DELIVERY', record.id, '', '', error); }
  });
}

function miCheckRows_(sheet, urlCol, httpCol, statusCol, checkedCol, now) {
  if (sheet.getLastRow() < 2) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(function(row, index) {
    const url = miUrl_(row[urlCol - 1]); if (!url) return; const link = miCheckUrl_(url);
    sheet.getRange(index + 2, httpCol).setValue(miSafeCell_(link.code)); sheet.getRange(index + 2, statusCol).setValue(miSafeCell_(link.status)); sheet.getRange(index + 2, checkedCol).setValue(miSafeCell_(now));
  });
}

function miCheckUrl_(url) { try { const response = UrlFetchApp.fetch(url, { method: 'get', followRedirects: true, muteHttpExceptions: true, validateHttpsCertificates: true }); const code = response.getResponseCode(); return { status: code >= 200 && code < 400 ? 'Reachable' : 'Broken', code: code }; } catch (error) { return { status: 'Broken', code: '' }; } }

function miEnsureSheet_(ss, name, headers) { const sheet = ss.getSheetByName(name) || ss.insertSheet(name); /* Always restore the canonical schema when upgrading an older workbook. */ sheet.getRange(1, 1, 1, headers.length).setValues(miSafeRows_([headers])); miStyle_(sheet, headers.length); return sheet; }
function miStyle_(sheet, width) { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#e8eee9').setFontColor('#172019').setWrap(true); if (sheet.getLastRow() > 1 && !sheet.getFilter()) sheet.getRange(1, 1, sheet.getLastRow(), width).createFilter(); }
function miValidation_(sheet, start, count) { const status = SpreadsheetApp.newDataValidation().requireValueInList(MI.statuses, true).setAllowInvalid(false).build(); const verify = SpreadsheetApp.newDataValidation().requireValueInList(['Unverified', 'Potential duplicate — verify', 'Verified', 'Broken source', 'Not applicable'], true).setAllowInvalid(false).build(); sheet.getRange(start, 36, count, 1).setDataValidation(verify); sheet.getRange(start, 37, count, 1).setDataValidation(status); miDgValidation_(sheet, start, count, 45); }
function miDgValidation_(sheet, start, count, column) { const rule = SpreadsheetApp.newDataValidation().requireValueInList(MI.dgClassifications, true).setAllowInvalid(false).build(); sheet.getRange(start, column, count, 1).setDataValidation(rule); }
function miSpreadsheet_() { return SpreadsheetApp.openById(MI.spreadsheetId); }
function miSheet_(name) { const sheet = miSpreadsheet_().getSheetByName(name); if (!sheet) throw new Error('Missing sheet ' + name + '. Run setupMcciaMediaIntelligence.'); return sheet; }
function miObjects_(sheet) { if (sheet.getLastRow() < 2) return []; const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues(); const headers = values.shift().map(String); return values.filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row) { return headers.reduce(function(out, header, index) { out[header] = row[index]; return out; }, {}); }); }
function miRow_(sheet, row) { const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]; const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0]; return headers.reduce(function(out, header, index) { out[header] = values[index]; return out; }, {}); }
function miResponseMap_(response) { return response.getItemResponses().reduce(function(out, item) { const value = item.getResponse(); out[item.getItem().getTitle()] = Array.isArray(value) ? value.join(', ') : value; return out; }, {}); }
function miFileIds_(response) { const ids = []; response.getItemResponses().forEach(function(item) { if (item.getItem().getType() !== FormApp.ItemType.FILE_UPLOAD) return; const value = item.getResponse(); (Array.isArray(value) ? value : [value]).forEach(function(id) { if (id) ids.push(String(id)); }); }); return ids; }
function miArchiveFolder_(date) { const root = DriveApp.getFolderById(MI.archiveFolderId); if (!date) return miFolder_(root, 'Date unavailable'); const year = miFolder_(root, date.slice(0, 4)); return miFolder_(year, miMonthLabel_(date)); }
function miFolder_(parent, name) { const folders = parent.getFoldersByName(name); const folder=folders.hasNext() ? folders.next() : parent.createFolder(name);folder.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);return folder; }
function miFilename_(date, publisher, sequence, original) { const ext = (original.match(/\.[A-Za-z0-9]{2,6}$/) || ['.bin'])[0].toLowerCase(); const safe = publisher.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'Publisher'; return (date || 'undated') + '__' + safe + '__' + Utilities.formatString('%02d', sequence) + ext; }
function miAudit_(record, action, actor, previous, next, details, source) { try { miSheet_(MI.sheets.audit).appendRow(miSafeRow_([new Date(), record, action, actor, previous, next, details, source])); } catch (ignore) {} }
function miError_(stage, record, response, file, error) { try { miSheet_(MI.sheets.errors).appendRow(miSafeRow_([new Date(), stage, record, response, file, error && error.message ? error.message : String(error), error && error.stack ? error.stack : '', false, '', ''])); } catch (ignore) {} }
function miSha_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(value) { return (value < 0 ? value + 256 : value).toString(16).padStart(2, '0'); }).join(''); }
function miSimilarity_(left, right) { const a = new Set(miNorm_(left).split(' ').filter(function(t) { return t.length > 2; })); const b = new Set(miNorm_(right).split(' ').filter(function(t) { return t.length > 2; })); if (!a.size || !b.size) return 0; let overlap = 0; a.forEach(function(t) { if (b.has(t)) overlap += 1; }); return overlap / (a.size + b.size - overlap); }
function miNorm_(value) { return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim(); }
function miClean_(value, max) { return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, max); }
function miUrl_(value) { const url = miClean_(value, 2000); return /^https?:\/\/\S+$/i.test(url) ? url : ''; }
function miDate_(value) {
  const text = miClean_(value, 100).replace(/[०-९]/g, function(digit) { return String('०१२३४५६७८९'.indexOf(digit)); });
  let candidate = '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    candidate = Utilities.formatDate(value, 'Asia/Kolkata', 'yyyy-MM-dd');
  } else {
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
    const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (iso) candidate = iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
    else if (dmy) candidate = dmy[3] + '-' + dmy[2].padStart(2, '0') + '-' + dmy[1].padStart(2, '0');
    else if (/[A-Za-z]{3}/.test(text)) {
      const parsed = new Date(text); // Named months/RSS timestamps only; never guess numeric order.
      if (!isNaN(parsed.getTime())) candidate = Utilities.formatDate(parsed, 'Asia/Kolkata', 'yyyy-MM-dd');
    }
  }
  if (!candidate) return '';
  const parsed = new Date(candidate + 'T00:00:00Z');
  const today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate && candidate <= today ? candidate : '';
}

function miMonthLabel_(date) { if (!date) return 'Date unavailable'; const month = Number(date.slice(5, 7)); return Utilities.formatString('%02d-%s', month, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] || 'Unknown'); }
function miMediaType_(mime) { return mime === MimeType.PDF ? 'PDF / report' : /^video\//i.test(mime) ? 'Video' : /^image\//i.test(mime) ? 'Newspaper clipping' : 'Other'; }
function miHeadline_(text) { return String(text || '').split(/\r?\n/).map(function(line) { return line.replace(/\s+/g, ' ').trim(); }).filter(function(line) { return line.length >= 12 && line.length <= 220; }).sort(function(a, b) { return b.length - a.length; })[0] || ''; }
function miMetadataValue_(value, fallback) { const supplied = miClean_(value, 500); return !supplied || /^(unknown|auto(?:matic)?(?: detect)?|not recorded|language not recorded|person not recorded)$/i.test(supplied) ? fallback : supplied; }
function miLanguage_(text) { return detectMediaMetadata(text).language; }
function miPresence_(text) { return detectMediaMetadata(text).presence; }
function miDgValue_(value) { const text = miClean_(value, 100); return MI.dgClassifications.indexOf(text) >= 0 ? text : ''; }
function miDgClassification_(text) { return detectMediaMetadata(text).dgEngagementType || ''; }
function miTopic_(text) { return detectMediaMetadata(text).topic; }
function miPublisher_(title) { const parts = String(title || '').split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : ''; }
function miSourceId_(url, title) { return 'SRC-' + miSha_(Utilities.newBlob(miNorm_(url + '|' + title)).getBytes()).slice(0, 14).toUpperCase(); }
function miJson_(value) { try { return JSON.parse(value); } catch (error) { return null; } }

// Shared automatic metadata rules; kept in sync with app/automatic-metadata.js.
/** Deterministic suggestions from article text; these do not assert editorial review. */
function detectMediaMetadata(input) {
  const text = String(input || '').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').toLowerCase().replace(/\s+/g, ' ').slice(0, 100000);
  const words = new Set(text.replace(/[^\p{L}\p{M}]+/gu, ' ').split(' '));
  const hits = terms => terms.filter(term => words.has(term)).length;
  const dev = (text.match(/[\u0900-\u097f]/g) || []).length;
  const latin = (text.match(/[a-z]/g) || []).length;
  const mr = hits(['आहे','आहेत','यांनी','यांचे','यांच्या','मध्ये','आणि','असे','म्हणाले','होणार','असून','साठी','करणार','केले','झाले']);
  const hi = hits(['है','हैं','में','और','ने','कहा','होगा','लिए','किया','हुए','करने','इसके','साथ']);
  const en = hits(['the','and','with','for','said','from','this','will','has','have','was','in','to','over','since','via']);
  let language = 'Language not recorded';
  if (dev >= 12) {
    language = mr >= 2 && mr > hi ? 'Marathi' : hi >= 2 && hi > mr ? 'Hindi' : 'Marathi / Hindi';
    if (latin > dev * 0.35 && en >= 3) language = language === 'Marathi' ? 'English / Marathi' : 'Multilingual';
  } else if (latin >= 25 && en >= 2) language = 'English';
  const dg = /prashan(?:t|th)\s+girban[ei]|प्रशांत\s+गिरब(?:ने|ाणे|णे|भने)/.test(text);
  const org = /\bmccia\b|ma[hr]*atta chamber|maratha chamber|एमसीसी[आइ]यए|एमसीसीआयए|एमसीसीआईए|मराठा चेंबर/.test(text);
  const president = /mccia.{0,20}president|president.{0,20}mccia|एमसीसीआयए.{0,15}अध्यक्ष/.test(text);
  const people = [];
  if (dg) people.push('Prashant Girbane — Director General');
  if (president) people.push('MCCIA President');
  if (/sudhanwa kopardekar|सुधन्वा कोपर्डेकर/.test(text)) people.push('Sudhanwa Kopardekar');
  if (org) people.push('MCCIA');
  const name = '(?:prashan(?:t|th)\\s+girban[ei]|प्रशांत\\s+गिरब(?:ने|ाणे|णे|भने))';
  let dgEngagementType = null;
  if (new RegExp('(?:article|column|op[- ]?ed|post|written|authored)\\s+by\\s+(?:mr\\.?\\s+)?' + name).test(text) || new RegExp(name + '\\s+(?:यांचा\\s+लेख|यांनी\\s+लिहिलेला|writes|wrote)').test(text)) dgEngagementType = 'Post/article written by DG Sir';
  else if (new RegExp('(?:interview|conversation|podcast|dialogue)\\s+with\\s+(?:mr\\.?\\s+)?' + name).test(text) || new RegExp(name + '\\s+(?:यांची\\s+मुलाखत|यांच्याशी\\s+संवाद|in conversation with)').test(text)) dgEngagementType = 'Conversation with DG Sir';
  else if (new RegExp(name + '[^.!?।]{0,45}(?:\\bsaid\\b|\\bsays\\b|\\bstated\\b|म्हणाले|सांगितले|नमूद केले)').test(text)) dgEngagementType = 'Quote given by DG Sir';
  const rules = [
    ['Exports & trade', /\bexport|\btrade\b|निर्यात|व्यापार/],
    ['Skills & education', /\bskill|\btraining\b|\beducation\b|कौशल्य|प्रशिक्षण|शिक्षण/],
    ['Policy & regulation', /\bpolicy\b|\bbudget\b|\bregulation|\blabour code|धोरण|अर्थसंकल्प|नियम|आयुक्तालय/],
    ['Technology & innovation', /\bsemiconductor|\bartificial intelligence\b|\bai\b|\bcyber|तंत्रज्ञान|सेमीकंडक्टर|कृत्रिम बुद्धिमत्ता/],
    ['Manufacturing', /\bmanufactur|\bfactory|\bproduction\b|उत्पादन|कारखान/],
    ['Events & awards', /\bsummit\b|\bconclave\b|\bconference\b|\bawards?\b|परिषद|पुरस्कार|मेळावा/],
    ['MSME support', /\bmsmes?\b|एमएसएमई|लघु उद्योग/],
    ['Health & environment', /\bhealth\b|\bsustainab|\bclimate\b|आरोग्य|पर्यावरण/]
  ];
  const topic = (rules.find(rule => rule[1].test(text)) || ['Topic not assigned'])[0];
  return {language, topic, presence: people.join('; ') || 'Person not recorded', dgEngagementType};
}

function miSafeCell_(value) { return typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value; }
function miSafeRow_(row) { return row.map(miSafeCell_); }
function miSafeRows_(rows) { return rows.map(miSafeRow_); }
function miReportHealth_() { if(MI.storage==='drive')return;try { const rows=miObjects_(miSheet_(MI.sheets.submissions));miFetch_(MI.dashboardUrl+'/api/automation-status',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({pendingOcr:rows.filter(function(r){return r['Processing status']==='OCR retry pending'}).length,deliveryFailures:rows.filter(function(r){return r['Processing status']==='Delivery failed'}).length})}); } catch(error) { miError_('HEALTH_DELIVERY','','','',error); } }

// The web app executes as its owner. Every data request requires a signed server request.
function doGet() { return miGatewayJson_({ok:false,error:'Signed server request required.'}); }
function doPost(event) {
  try {
    const outer=JSON.parse(event.postData.contents||'{}'),secret=PropertiesService.getScriptProperties().getProperty('DRIVE_GATEWAY_SECRET');
    if(!secret||typeof outer.payload!=='string'||outer.payload.length>12000)throw new Error('Unauthorized');
    const expected=Utilities.computeHmacSha256Signature(outer.payload,secret).map(function(v){return (v<0?v+256:v).toString(16).padStart(2,'0')}).join('');
    if(typeof outer.signature!=='string'||outer.signature.length!==expected.length)throw new Error('Unauthorized');
    let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^outer.signature.charCodeAt(i);if(diff)throw new Error('Unauthorized');
    const call=JSON.parse(outer.payload);if(Math.abs(Date.now()-call.at)>5*60000||!call.nonce)throw new Error('Expired request');
    const data=call.data||{};let result;
    if(call.action==='published'){const page=miPage_(miPublishedRows_().map(function(r){return {id:r['Approved record ID'],row:r}}),data);result={records:page.records.map(function(r){return miPublicClipping_(r.row)}),nextCursor:page.nextCursor};}
    else if(call.action==='health'){const rows=miObjects_(miSheet_(MI.sheets.submissions)),pending=rows.filter(function(r){return r['Processing status']==='OCR retry pending'}).length,failed=rows.filter(function(r){return r['Processing status']==='Delivery failed'}).length;result={state:pending||failed?'attention':'connected',pendingOcr:pending,failures:failed,message:pending?pending+' clippings are waiting for automatic OCR retry.':failed?failed+' uploads need another delivery attempt.':'Drive and Sheets are connected. Only automatically published files are exposed.',lastPublished:rows.filter(function(r){return r['Processing status']==='Auto-published'}).map(function(r){return new Date(r['Updated at']).toISOString()}).sort().pop()||null};}
    else if(call.action==='fileInfo'||call.action==='fileChunk'){
      const row=miFindPublished_(data.id),file=DriveApp.getFileById(row['Drive file ID']);
      if(call.action==='fileInfo')result={size:file.getSize(),type:file.getMimeType(),name:file.getName()};
      else{const start=Number(data.start),end=Number(data.end);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=file.getSize()||end-start>=512*1024)throw new Error('Invalid range');const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.getId())+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),Range:'bytes='+start+'-'+end},muteHttpExceptions:true});if(response.getResponseCode()!==206&&!(response.getResponseCode()===200&&start===0&&end===file.getSize()-1))throw new Error('Evidence could not be read');result={base64:Utilities.base64Encode(response.getBlob().getBytes())};}
    }else if(call.action==='sources')result=miPage_(miObjects_(miSheet_(MI.sheets.sources)).filter(function(r){return miRelevantHeadline_(r.Title)}).map(function(r){const date=miDate_(r['Publication date']);return {id:r['Source ID'],title:r.Title,date:date,year:date?Number(date.slice(0,4)):null,publisher:r.Publisher,url:miPublicSource_(r['Source URL']),language:r.Language,presence:r['People / organisation'],topic:r.Topic,dgEngagementType:r['DG content classification'],type:'Article',format:'Article',status:'Unverified',description:'Discovered source; verification required.',discoveredAt:new Date(r['Discovered at']).toISOString()}}),data);
    else if(call.action==='corrections')result=miPage_(miObjects_(miGatewaySheet_('Website Corrections',['ID','Patch','Updated at'])).map(function(r){return {id:r.ID,patch:JSON.parse(r.Patch),updatedAt:r['Updated at']}}),data);
    else if(call.action==='correct'){
      const cache=CacheService.getScriptCache();if(cache.get(call.nonce))throw new Error('Request already used');cache.put(call.nonce,'1',300);result=miGatewayCorrection_(data);
    }else throw new Error('Unknown action');
    return miGatewayJson_({ok:true,data:result});
  }catch(error){return miGatewayJson_({ok:false,error:error.message||'Drive request failed'});}
}
function miGatewayJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function miPublishedRows_(){const seen={},rows=miObjects_(miSheet_(MI.sheets.submissions));rows.forEach(function(r){if(['Withdrawn','Rejected'].indexOf(r['Processing status'])>=0)seen[r['Approved record ID']]=true});return rows.filter(function(r){const id=r['Approved record ID'];if(r['Processing status']!=='Auto-published'||!id||seen[id])return false;seen[id]=true;return true;});}
function miFindPublished_(id){const row=miPublishedRows_().filter(function(r){return r['Approved record ID']===id})[0];if(!row)throw new Error('Published clipping not found');return row;}
function miPublicSource_(value){const url=miUrl_(value);return /^https?:\/\/(?:drive|docs)\.google\.com/i.test(url)?'':url;}
function miPublicClipping_(r){const id=r['Approved record ID'],date=miDate_(r['Publication date']),image='/api/uploads/'+encodeURIComponent(id)+'/image';let text=String(r['OCR text']||'');if(r['OCR text file ID'])text=DriveApp.getFileById(r['OCR text file ID']).getBlob().getDataAsString();return {id:id,sha256:r['Binary SHA-256'],date:date,year:date?Number(date.slice(0,4)):null,publisher:r.Publisher,page:r['Page number'],language:r.Language,presence:r['People / organisation'],topic:r.Topic,dgEngagementType:r['DG content classification']||null,ocrHeadline:r.Headline,ocrText:text,ocrExcerpt:text.slice(0,650),ocrStatus:text?'Completed':'Not available',ocrEngine:r['OCR engine'],ocrConfidence:null,ocrReviewStatus:'Automatic transcription · not editorially verified',thumbnailUrl:/^image\//.test(r['MIME type'])?image:r['MIME type']==='application/pdf'?'/fallbacks/pdf.webp':'/fallbacks/video.webp',originalContentType:r['MIME type'],originalImageUrl:image,originalFilename:'Published clipping',quality:'Original',matchStatus:'Automatically processed upload',matchedRecordId:null,uploaded:true,automated:true,status:'Auto-published',uploadedAt:new Date(r['Updated at']).toISOString(),publicSourceUrl:miPublicSource_(r['Source URL'])};}
function miPage_(rows,data){rows.sort(function(a,b){return b.id.localeCompare(a.id)});if(data.cursor)rows=rows.filter(function(r){return r.id<data.cursor});const n=Math.max(1,Math.min(100,Number(data.limit)||100)),page=rows.slice(0,n);return {records:page,nextCursor:rows.length>n?page[page.length-1].id:null};}
function miGatewaySheet_(name,headers){const ss=miSpreadsheet_();let sheet=ss.getSheetByName(name);if(!sheet){sheet=ss.insertSheet(name);sheet.appendRow(miSafeRow_(headers));}return sheet;}
function miGatewayCorrection_(data){
 if(!/^[A-Z0-9-]{3,80}$/.test(data.id||'')||typeof data.title!=='string'||!data.title.trim()||data.title.length>1000||typeof data.reason!=='string'||data.reason.trim().length<10)throw new Error('Invalid correction');
 if(data.date!==undefined&&data.date!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!miDate_(data.date)))throw new Error('Invalid date');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{const sheet=miGatewaySheet_('Website Corrections',['ID','Patch','Updated at']),rows=miObjects_(sheet);const index=rows.findIndex(function(r){return r.ID===data.id}),old=index>=0?rows[index]:null;if(String(old?old['Updated at']:'')!==String(data.version||''))throw new Error('This article changed. Reload before editing.');const patch=Object.assign({},old?JSON.parse(old.Patch):{},{title:data.title.trim()},data.date===undefined?{}:{date:data.date,year:data.date?Number(data.date.slice(0,4)):null,datePrecision:data.date?'day':'unavailable',publicationMonth:''}),now=new Date().toISOString();
 miGatewaySheet_('Website Correction Audit',['Timestamp','ID','Actor','Reason','Previous patch','Patch']).appendRow(miSafeRow_([now,data.id,data.actor,data.reason,old?old.Patch:'',JSON.stringify(patch)]));const values=[data.id,JSON.stringify(patch),now];if(index>=0)sheet.getRange(index+2,1,1,3).setValues(miSafeRows_([values]));else sheet.appendRow(miSafeRow_(values));return {id:data.id,patch:patch,updatedAt:now};}finally{lock.releaseLock()}
}
