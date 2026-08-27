const MI = Object.freeze({
  formId: '1RhQNG2vzrBuyIEdIgEKXPBqfRi-GOrjLhWg34TibB5Q',
  archiveFolderId: '105kcn3EBPbTF8Iy5JkWudlG7FUMmeGps',
  spreadsheetId: '16O4eViZ9I7y8YbUaaPt3jMjfQW9nvdaOAHAPtw0NAgA',
  dashboardUrl: 'https://mccia-media-monitor.guptaaarushi592.chatgpt.site',
  ownerEmail: 'mccianewsclipping@gmail.com',
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
  statuses: Object.freeze(['Pending', 'Approved', 'Rejected']),
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
  'Link HTTP status', 'Last link check', 'Verification status', 'Editorial status',
  'Reviewer', 'Reviewed at', 'Dashboard inbox ID', 'Approved record ID',
  'Dashboard status', 'Error message', 'Updated at',
];
const MI_AUDIT_HEADERS = ['Timestamp', 'Record ID', 'Action', 'Actor', 'Previous status', 'New status', 'Details', 'Source'];
const MI_ERROR_HEADERS = ['Timestamp', 'Stage', 'Record ID', 'Form response ID', 'Drive file ID', 'Error message', 'Stack', 'Resolved', 'Resolved by', 'Resolved at'];
const MI_SOURCE_HEADERS = ['Source ID', 'Discovered at', 'Publication date', 'Publisher', 'Title', 'Language', 'People / organisation', 'Topic', 'Source URL', 'Discovery type', 'Query / feed', 'HTTP status', 'Link status', 'Last checked', 'Verification status', 'Dashboard status', 'Notes'];

function setupMcciaMediaIntelligence() {
  const form = FormApp.openById(MI.formId);
  miValidateForm_(form);
  miEnsureWorkbook_();
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
  if (!date) throw new Error('A valid clipping/publication date is required.');
  if (!fileIds.length) throw new Error('No uploaded evidence was found.');
  fileIds.forEach(function(fileId, index) {
    let recordId = '';
    try {
      recordId = miProcessFile_(fileId, index + 1, response, values, date, publisher);
      miAudit_(recordId, 'SUBMITTED', actor, '', 'Pending', 'Archived, OCR processed and duplicate checked.', 'Google Form');
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
  file.setName(archivedName);
  const ocr = miOcr_(file, mime);
  const headline = miClean_(values[MI.fields.headline], 500) || miHeadline_(ocr.text) || 'Headline requires editorial review';
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
    language: miClean_(values[MI.fields.language], 100) || miLanguage_(ocr.text),
    headline: headline,
    presence: miClean_(values[MI.fields.presence], 500) || miPresence_(headline + ' ' + ocr.text),
    notes: miClean_(values[MI.fields.notes], 3000), sourceUrl: sourceUrl,
    ocrText: ocr.text, ocrConfidence: ocr.confidence, ocrEngine: ocr.engine,
    duplicateScore: duplicate.score, duplicateRecordId: duplicate.recordId,
    duplicateReasons: duplicate.reasons.join('; '), linkStatus: link.status,
    linkHttpStatus: link.code,
  };
  const sheet = miSheet_(MI.sheets.submissions);
  sheet.appendRow([
    recordId, response.getId(), response.getTimestamp(), now, date, Number(date.slice(0, 4)), miMonthLabel_(date),
    publisher, metadata.editionCity, metadata.mediaType, metadata.presence, headline, metadata.language,
    sourceUrl, metadata.page, metadata.notes, miClean_(values[MI.fields.submittedBy], 250), metadata.submitterEmail,
    originalName, archivedName, mime, size, file.getId(), file.getUrl(), folder.getUrl(), sha,
    ocr.text, ocr.confidence, ocr.engine, duplicate.score, duplicate.recordId, duplicate.reasons.join('; '),
    link.status, link.code, sourceUrl ? now : '', duplicate.score >= 0.72 ? 'Potential duplicate — verify' : 'Unverified',
    'Pending', '', '', '', '', 'Pending dashboard delivery', '', now,
  ]);
  const row = sheet.getLastRow();
  metadata.sheetRow = row;
  miValidation_(sheet, row, 1);
  const delivery = miSendIntake_(file, metadata);
  sheet.getRange(row, 40, 1, 4).setValues([[delivery.id, '', delivery.status, delivery.error]]);
  sheet.getRange(row, 44).setValue(new Date());
  return recordId;
}

function onMcciaSheetEdit(event) {
  if (!event || !event.range) return;
  const range = event.range;
  if (range.getSheet().getName() !== MI.sheets.submissions || range.getRow() < 2 || range.getColumn() !== 37) return;
  const status = miClean_(range.getDisplayValue(), 50);
  const previous = miClean_(event.oldValue, 50) || 'Pending';
  if (MI.statuses.indexOf(status) < 0) { range.setValue(previous); throw new Error('Use Pending, Approved or Rejected.'); }
  const row = miRow_(range.getSheet(), range.getRow());
  const actor = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Sheet editor';
  range.getSheet().getRange(range.getRow(), 38, 1, 2).setValues([[actor, new Date()]]);
  try {
    const result = miDecision_(row, status, actor);
    range.getSheet().getRange(range.getRow(), 41, 1, 3).setValues([[result.approvedId, result.status, result.error]]);
  } catch (error) {
    range.getSheet().getRange(range.getRow(), 43).setValue(error.message || String(error));
    miError_('EDITORIAL_DECISION', row['Record ID'], row['Form response ID'], row['Drive file ID'], error);
  }
  range.getSheet().getRange(range.getRow(), 44).setValue(new Date());
  miAudit_(row['Record ID'], 'EDITORIAL_STATUS_CHANGED', actor, previous, status, 'Decision synchronized to the dashboard.', 'Google Sheet');
  rebuildMcciaAnalytics();
}

function runWeeklyDiscovery() {
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
    ['Pending editorial review', submissions.filter(function(r) { return r['Editorial status'] === 'Pending'; }).length],
    ['Approved evidence', submissions.filter(function(r) { return r['Editorial status'] === 'Approved'; }).length],
    ['Rejected evidence', submissions.filter(function(r) { return r['Editorial status'] === 'Rejected'; }).length],
    ['Potential duplicates', submissions.filter(function(r) { return Number(r['Duplicate score']) >= 0.72; }).length],
    ['OCR completed', submissions.filter(function(r) { return Boolean(r['OCR text']); }).length],
    ['Broken source links', submissions.concat(sources).filter(function(r) { return r['Link status'] === 'Broken'; }).length],
    ['Weekly source candidates', sources.length], ['', ''],
  ];
  [['Editorial status', 'Editorial status'], ['People / organisation', 'People / organisation'], ['Language', 'Language'], ['Publisher', 'Publisher']].forEach(function(group) {
    rows.push([group[0], 'Count']);
    const values = count(submissions, group[1]);
    Object.keys(values).sort(function(a, b) { return values[b] - values[a]; }).slice(0, 30).forEach(function(key) { rows.push([key, values[key]]); });
    rows.push(['', '']);
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#194d36').setFontColor('#ffffff');
  sheet.autoResizeColumn(1); sheet.setColumnWidth(2, 110);
}

function miEnsureWorkbook_() {
  const ss = miSpreadsheet_();
  miEnsureSheet_(ss, MI.sheets.submissions, MI_SUBMISSION_HEADERS);
  miEnsureSheet_(ss, MI.sheets.audit, MI_AUDIT_HEADERS);
  miEnsureSheet_(ss, MI.sheets.errors, MI_ERROR_HEADERS);
  miEnsureSheet_(ss, MI.sheets.sources, MI_SOURCE_HEADERS);
  miEnsureSheet_(ss, MI.sheets.analytics, ['Metric', 'Count']);
  const config = miEnsureSheet_(ss, MI.sheets.config, ['Setting', 'Value', 'Purpose']);
  const configRows = [
    ['Setting', 'Value', 'Purpose'], ['Form ID', MI.formId, 'MCCIA team collection form'],
    ['Archive folder ID', MI.archiveFolderId, 'Permanent Year / Month archive'],
    ['Dashboard URL', MI.dashboardUrl, 'Dashboard webhook and review UI'],
    ['Weekly discovery', 'Monday 07:00 Asia/Kolkata', 'Google News, RSS and e-paper search'],
    ['Daily link checks', '06:00 Asia/Kolkata', 'Broken-source monitoring'],
    ['Duplicate threshold', '0.72', 'Headline, date and image-content score'],
    ['Editorial states', 'Pending, Approved, Rejected', 'Only approved evidence enters the main archive'],
    ['Owner', MI.ownerEmail, 'Authorized Apps Script identity'],
  ];
  config.clearContents(); config.getRange(1, 1, configRows.length, 3).setValues(configRows); miStyle_(config, 3);
  const submissions = ss.getSheetByName(MI.sheets.submissions);
  miValidation_(submissions, 2, Math.max(1, submissions.getMaxRows() - 1));
}

function miInstallTriggers_(form) {
  const handlers = ['onMcciaFormSubmit', 'onMcciaSheetEdit', 'runWeeklyDiscovery', 'monitorSourceLinks'];
  ScriptApp.getProjectTriggers().forEach(function(trigger) { if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('onMcciaFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('onMcciaSheetEdit').forSpreadsheet(MI.spreadsheetId).onEdit().create();
  ScriptApp.newTrigger('runWeeklyDiscovery').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  ScriptApp.newTrigger('monitorSourceLinks').timeBased().everyDays(1).atHour(6).create();
}

function miValidateForm_(form) {
  const titles = form.getItems().map(function(item) { return item.getTitle(); });
  const missing = Object.keys(MI.fields).map(function(key) { return MI.fields[key]; }).filter(function(title) { return titles.indexOf(title) < 0; });
  if (missing.length) throw new Error('The Form is missing: ' + missing.join(', '));
  const uploads = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  if (!uploads.length || uploads[0].getTitle() !== MI.fields.evidence) throw new Error('The evidence File upload question is missing.');
}

function miOcr_(file, mime) {
  if (/^video\//i.test(mime)) return { text: '', confidence: '', engine: 'Skipped — video evidence' };
  if (!/^image\//i.test(mime) && mime !== MimeType.PDF) return { text: '', confidence: '', engine: 'Skipped — unsupported OCR format' };
  let tempId = '';
  try {
    const created = Drive.Files.create({ name: 'OCR temporary — ' + file.getName(), mimeType: 'application/vnd.google-apps.document' }, file.getBlob(), { ocrLanguage: 'en', fields: 'id' });
    tempId = created.id; Utilities.sleep(800);
    const text = DocumentApp.openById(tempId).getBody().getText().replace(/\n{3,}/g, '\n\n').trim().slice(0, 100000);
    return { text: text, confidence: text ? Math.min(95, Math.round(45 + Math.log(text.length + 1) * 7)) : 0, engine: 'Google Drive OCR' };
  } catch (error) { miError_('OCR', '', '', file.getId(), error); return { text: '', confidence: 0, engine: 'Google Drive OCR failed' }; }
  finally { if (tempId) try { DriveApp.getFileById(tempId).setTrashed(true); } catch (ignore) {} }
}

function miDuplicate_(candidate) {
  let best = { score: 0, recordId: '', reasons: [] };
  miObjects_(miSheet_(MI.sheets.submissions)).forEach(function(row) {
    if (!row['Record ID'] || row['Record ID'] === candidate.recordId) return;
    const exact = miClean_(row['Binary SHA-256'], 100) === candidate.sha;
    const date = miClean_(row['Publication date'], 20) === candidate.date ? 1 : 0;
    const headline = miSimilarity_(row['Headline'], candidate.headline);
    const ocr = miSimilarity_(String(row['OCR text'] || '').slice(0, 5000), String(candidate.ocr || '').slice(0, 5000));
    const oldSize = Number(row['File size']) || 0;
    const size = oldSize && candidate.size ? Math.min(oldSize, candidate.size) / Math.max(oldSize, candidate.size) : 0;
    const image = exact ? 1 : ocr * 0.8 + size * 0.2;
    const score = Math.min(1, image * 0.45 + headline * 0.30 + date * 0.20 + (miNorm_(row['Publisher']) === miNorm_(candidate.publisher) ? 0.05 : 0));
    const reasons = [];
    if (exact) reasons.push('exact image SHA-256'); else if (image >= 0.72) reasons.push('high OCR/image-content similarity ' + Math.round(image * 100) + '%');
    if (headline >= 0.72) reasons.push('headline similarity ' + Math.round(headline * 100) + '%'); if (date) reasons.push('same publication date');
    if (score > best.score) best = { score: Number(score.toFixed(3)), recordId: row['Record ID'], reasons: reasons };
  });
  return best;
}

function miSendIntake_(file, metadata) {
  try {
    const response = miFetch_(MI.dashboardUrl + '/api/form-intake', { method: 'post', payload: { file: file.getBlob().setName(file.getName()), metadata: JSON.stringify(metadata) }, muteHttpExceptions: true });
    const body = miJson_(response.getContentText()) || {};
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(body.error || ('HTTP ' + response.getResponseCode()));
    return { id: body.record && body.record.id || '', status: body.duplicate ? 'Duplicate connected' : 'Delivered', error: '' };
  } catch (error) { return { id: '', status: 'Delivery failed', error: error.message || String(error) }; }
}

function miDecision_(row, status, actor) {
  const id = miClean_(row['Dashboard inbox ID'], 200);
  if (!id) return { approvedId: '', status: 'No dashboard inbox ID', error: 'Submission has not reached the dashboard.' };
  const response = miFetch_(MI.dashboardUrl + '/api/form-intake/' + encodeURIComponent(id), { method: 'patch', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ status: status === 'Pending' ? 'Pending OCR' : status, actor: actor, headline: row['Headline'], ocrText: row['OCR text'], ocrConfidence: row['OCR confidence'], verificationStatus: row['Verification status'] }) });
  const body = miJson_(response.getContentText()) || {};
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(body.error || ('HTTP ' + response.getResponseCode()));
  return { approvedId: body.record && body.record.approvedRecordId || '', status: 'Editorial status synchronized', error: '' };
}

function miFetch_(url, options) {
  const request = Object.assign({}, options || {});
  request.headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() });
  return UrlFetchApp.fetch(url, request);
}

function miGoogleNewsUrl_(query) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:8d') + '&hl=en-IN&gl=IN&ceid=IN:en'; }

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
    return { id: miSourceId_(link, title), discoveredAt: now, date: date, publisher: child('source') || miPublisher_(title) || 'Publisher not recorded', title: title, language: miLanguage_(title), presence: miPresence_(title), topic: miTopic_(title), url: link, discoveryType: type, query: query, notes: 'Automated discovery; editorial verification required.' };
  }).filter(function(item) { return item.title && miUrl_(item.url); });
}

function miPortalRecord_(feed, now) { return { id: miSourceId_(feed.url, feed.label), discoveredAt: now, date: '', publisher: feed.label, title: feed.label + ' source requires manual review', language: 'Unknown', presence: 'MCCIA', topic: 'E-paper / publisher portal', url: feed.url, discoveryType: 'E-paper / publisher portal', query: feed.label, notes: 'Public portal monitored; page-level search may require editorial review.' }; }

function miUpsertSources_(records) {
  const sheet = miSheet_(MI.sheets.sources); const byUrl = {};
  miObjects_(sheet).forEach(function(row, index) { if (row['Source URL']) byUrl[row['Source URL']] = index + 2; });
  records.forEach(function(record) {
    const link = miCheckUrl_(record.url);
    const values = [record.id, record.discoveredAt, record.date, record.publisher, record.title, record.language, record.presence, record.topic, record.url, record.discoveryType, record.query, link.code, link.status, new Date(), 'Unverified', 'Pending dashboard delivery', record.notes];
    if (byUrl[record.url]) sheet.getRange(byUrl[record.url], 1, 1, MI_SOURCE_HEADERS.length).setValues([values]); else { sheet.appendRow(values); byUrl[record.url] = sheet.getLastRow(); }
    try { miFetch_(MI.dashboardUrl + '/api/source-monitoring', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(Object.assign({}, record, { linkStatus: link.status, httpStatus: link.code })) }); } catch (error) { miError_('SOURCE_DELIVERY', record.id, '', '', error); }
  });
}

function miCheckRows_(sheet, urlCol, httpCol, statusCol, checkedCol, now) {
  if (sheet.getLastRow() < 2) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(function(row, index) {
    const url = miUrl_(row[urlCol - 1]); if (!url) return; const link = miCheckUrl_(url);
    sheet.getRange(index + 2, httpCol).setValue(link.code); sheet.getRange(index + 2, statusCol).setValue(link.status); sheet.getRange(index + 2, checkedCol).setValue(now);
  });
}

function miCheckUrl_(url) { try { const response = UrlFetchApp.fetch(url, { method: 'get', followRedirects: true, muteHttpExceptions: true, validateHttpsCertificates: true }); const code = response.getResponseCode(); return { status: code >= 200 && code < 400 ? 'Reachable' : 'Broken', code: code }; } catch (error) { return { status: 'Broken', code: '' }; } }

function miEnsureSheet_(ss, name, headers) { const sheet = ss.getSheetByName(name) || ss.insertSheet(name); /* Always restore the canonical schema when upgrading an older workbook. */ sheet.getRange(1, 1, 1, headers.length).setValues([headers]); miStyle_(sheet, headers.length); return sheet; }
function miStyle_(sheet, width) { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#e8eee9').setFontColor('#172019').setWrap(true); if (sheet.getLastRow() > 1 && !sheet.getFilter()) sheet.getRange(1, 1, sheet.getLastRow(), width).createFilter(); }
function miValidation_(sheet, start, count) { const status = SpreadsheetApp.newDataValidation().requireValueInList(MI.statuses, true).setAllowInvalid(false).build(); const verify = SpreadsheetApp.newDataValidation().requireValueInList(['Unverified', 'Potential duplicate — verify', 'Verified', 'Broken source', 'Not applicable'], true).setAllowInvalid(false).build(); sheet.getRange(start, 36, count, 1).setDataValidation(verify); sheet.getRange(start, 37, count, 1).setDataValidation(status); }
function miSpreadsheet_() { return SpreadsheetApp.openById(MI.spreadsheetId); }
function miSheet_(name) { const sheet = miSpreadsheet_().getSheetByName(name); if (!sheet) throw new Error('Missing sheet ' + name + '. Run setupMcciaMediaIntelligence.'); return sheet; }
function miObjects_(sheet) { if (sheet.getLastRow() < 2) return []; const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues(); const headers = values.shift().map(String); return values.filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row) { return headers.reduce(function(out, header, index) { out[header] = row[index]; return out; }, {}); }); }
function miRow_(sheet, row) { const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]; const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0]; return headers.reduce(function(out, header, index) { out[header] = values[index]; return out; }, {}); }
function miResponseMap_(response) { return response.getItemResponses().reduce(function(out, item) { const value = item.getResponse(); out[item.getItem().getTitle()] = Array.isArray(value) ? value.join(', ') : value; return out; }, {}); }
function miFileIds_(response) { const ids = []; response.getItemResponses().forEach(function(item) { if (item.getItem().getType() !== FormApp.ItemType.FILE_UPLOAD) return; const value = item.getResponse(); (Array.isArray(value) ? value : [value]).forEach(function(id) { if (id) ids.push(String(id)); }); }); return ids; }
function miArchiveFolder_(date) { const root = DriveApp.getFolderById(MI.archiveFolderId); const year = miFolder_(root, date.slice(0, 4)); return miFolder_(year, miMonthLabel_(date)); }
function miFolder_(parent, name) { const folders = parent.getFoldersByName(name); return folders.hasNext() ? folders.next() : parent.createFolder(name); }
function miFilename_(date, publisher, sequence, original) { const ext = (original.match(/\.[A-Za-z0-9]{2,6}$/) || ['.bin'])[0].toLowerCase(); const safe = publisher.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'Publisher'; return date + '__' + safe + '__' + Utilities.formatString('%02d', sequence) + ext; }
function miAudit_(record, action, actor, previous, next, details, source) { try { miSheet_(MI.sheets.audit).appendRow([new Date(), record, action, actor, previous, next, details, source]); } catch (ignore) {} }
function miError_(stage, record, response, file, error) { try { miSheet_(MI.sheets.errors).appendRow([new Date(), stage, record, response, file, error && error.message ? error.message : String(error), error && error.stack ? error.stack : '', false, '', '']); } catch (ignore) {} }
function miSha_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(value) { return (value < 0 ? value + 256 : value).toString(16).padStart(2, '0'); }).join(''); }
function miSimilarity_(left, right) { const a = new Set(miNorm_(left).split(' ').filter(function(t) { return t.length > 2; })); const b = new Set(miNorm_(right).split(' ').filter(function(t) { return t.length > 2; })); if (!a.size || !b.size) return 0; let overlap = 0; a.forEach(function(t) { if (b.has(t)) overlap += 1; }); return overlap / (a.size + b.size - overlap); }
function miNorm_(value) { return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim(); }
function miClean_(value, max) { return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, max); }
function miUrl_(value) { const url = miClean_(value, 2000); return /^https?:\/\/\S+$/i.test(url) ? url : ''; }
function miDate_(value) { if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd'); const text = miClean_(value, 100); const iso = text.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/); if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3]; const parsed = new Date(text); return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function miMonthLabel_(date) { const month = Number(date.slice(5, 7)); return Utilities.formatString('%02d-%s', month, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] || 'Unknown'); }
function miMediaType_(mime) { return mime === MimeType.PDF ? 'PDF / report' : /^video\//i.test(mime) ? 'Video' : /^image\//i.test(mime) ? 'Newspaper clipping' : 'Other'; }
function miHeadline_(text) { return String(text || '').split(/\r?\n/).map(function(line) { return line.replace(/\s+/g, ' ').trim(); }).filter(function(line) { return line.length >= 12 && line.length <= 220; }).sort(function(a, b) { return b.length - a.length; })[0] || ''; }
function miLanguage_(text) { const value = String(text || ''); const dev = (value.match(/[\u0900-\u097f]/g) || []).length; const latin = (value.match(/[A-Za-z]/g) || []).length; return dev && latin ? 'Marathi / Hindi / English' : dev ? 'Marathi / Hindi' : latin ? 'English' : 'Unknown'; }
function miPresence_(text) { const value = miNorm_(text); if (['prashant girbane', 'प्रशांत गिरबने', 'प्रशांत गिरबाणे', 'director general', 'महासंचालक'].some(function(term) { return value.indexOf(miNorm_(term)) >= 0; })) return 'Prashant Girbane — Director General'; if (['mccia president', 'president of mccia', 'एमसीसीआयए अध्यक्ष'].some(function(term) { return value.indexOf(miNorm_(term)) >= 0; })) return 'MCCIA President'; return value.indexOf('mccia') >= 0 || value.indexOf('mahratta chamber') >= 0 || value.indexOf('एमसीसीआयए') >= 0 ? 'MCCIA' : 'MCCIA relevance requires review'; }
function miTopic_(text) { const value = miNorm_(text); return /budget|policy|tax|government|infrastructure/.test(value) ? 'Policy and infrastructure' : /manufactur|industry|msme|factory/.test(value) ? 'Industry and manufacturing' : /export|trade|international|delegation/.test(value) ? 'Trade and international' : /event|summit|conference|expo|award/.test(value) ? 'Events and recognition' : 'MCCIA media monitoring'; }
function miPublisher_(title) { const parts = String(title || '').split(' - '); return parts.length > 1 ? parts[parts.length - 1].trim() : ''; }
function miSourceId_(url, title) { return 'SRC-' + miSha_(Utilities.newBlob(miNorm_(url + '|' + title)).getBytes()).slice(0, 14).toUpperCase(); }
function miJson_(value) { try { return JSON.parse(value); } catch (error) { return null; } }
