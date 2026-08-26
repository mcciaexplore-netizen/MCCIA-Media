const MCCIA_INTAKE = Object.freeze({
  formId: '1Ejcmw09OgeMwyx1KhBsx7e9KjnjdrMSojXE41haeS7c',
  rootFolderName: 'MCCIA Media Intelligence',
  archiveFolderName: 'Newspaper Clippings',
  logSpreadsheetName: 'MCCIA Clipping Submission and Error Log',
  logSheetName: 'Submission Log',
  dashboardWebhookUrl: 'https://mccia-media-monitor.guptaaarushi592.chatgpt.site/api/form-intake',
  maxImageBytes: 20 * 1024 * 1024,
  fields: Object.freeze({
    publicationDate: 'Publication date',
    publisher: 'Publisher / news channel',
    clippingImages: 'Newspaper clipping image(s)',
    page: 'Page number',
    language: 'Language',
    presence: 'People / organisation',
    headline: 'Headline, if readable',
    sourceUrl: 'Public source URL, if known',
    notes: 'Notes for the editor',
  }),
});

const LOG_HEADERS = [
  'Processed at', 'Form timestamp', 'Form response ID', 'Submitter email',
  'Publication date', 'Publisher', 'Drive file ID', 'Drive file URL',
  'Drive folder URL', 'Dashboard status', 'HTTP status', 'Dashboard inbox ID',
  'Duplicate', 'Error message', 'Original filename', 'Archived filename',
];

function setupMcciaIntake() {
  const form = FormApp.getActiveForm() || FormApp.openById(MCCIA_INTAKE.formId);
  validateForm_(form);
  const properties = PropertiesService.getScriptProperties();
  const root = getOrCreateRootFolder_();
  const archive = getOrCreateFolder_(root, MCCIA_INTAKE.archiveFolderName);
  const spreadsheet = getOrCreateLogSpreadsheet_();
  properties.setProperties({
    FORM_ID: form.getId(),
    ROOT_FOLDER_ID: root.getId(),
    ARCHIVE_FOLDER_ID: archive.getId(),
    LOG_SPREADSHEET_ID: spreadsheet.getId(),
    DASHBOARD_WEBHOOK_URL: properties.getProperty('DASHBOARD_WEBHOOK_URL') || MCCIA_INTAKE.dashboardWebhookUrl,
  });
  installSubmitTrigger_(form);
  console.log(JSON.stringify({
    formEditUrl: form.getEditUrl(),
    formPublishedUrl: form.getPublishedUrl(),
    archiveFolderUrl: archive.getUrl(),
    logSpreadsheetUrl: spreadsheet.getUrl(),
  }, null, 2));
}

function onMcciaFormSubmit(event) {
  if (!event || !event.response) throw new Error('This function must run from the installed Google Form submit trigger.');
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('MCCIA_INTAKE_SECRET');
  if (!secret) throw new Error('Missing MCCIA_INTAKE_SECRET in Apps Script project settings > Script properties.');
  const webhookUrl = properties.getProperty('DASHBOARD_WEBHOOK_URL') || MCCIA_INTAKE.dashboardWebhookUrl;
  const archive = DriveApp.getFolderById(requiredProperty_('ARCHIVE_FOLDER_ID'));
  const logSheet = getLogSheet_();
  const formResponse = event.response;
  const responses = responseMap_(formResponse);
  const publicationDate = normalizeDate_(responses[MCCIA_INTAKE.fields.publicationDate]);
  if (!publicationDate) throw new Error('The submitted publication date is missing or invalid.');
  const publisher = cleanText_(responses[MCCIA_INTAKE.fields.publisher], 200) || 'Publisher requires review';
  const yearFolder = getOrCreateFolder_(archive, publicationDate.slice(0, 4));
  const monthNumber = Number(publicationDate.slice(5, 7));
  const monthFolder = getOrCreateFolder_(yearFolder, Utilities.formatString('%02d-%s', monthNumber, monthName_(monthNumber)));
  const fileIds = fileUploadIds_(formResponse);
  if (!fileIds.length) throw new Error('No file upload was found in this response.');

  fileIds.forEach(function(fileId, index) {
    const processedAt = new Date();
    let originalName = '';
    let archivedName = '';
    let driveFileUrl = '';
    let status = 'Import failed';
    let httpStatus = '';
    let inboxId = '';
    let duplicate = '';
    let errorMessage = '';
    try {
      const file = DriveApp.getFileById(fileId);
      originalName = file.getName();
      if (file.getSize() > MCCIA_INTAKE.maxImageBytes) throw new Error('Image exceeds the dashboard 20 MB limit.');
      if (!/^image\/(jpeg|png|webp)$/i.test(file.getMimeType())) throw new Error('Only JPG, PNG and WebP images are supported.');
      archivedName = archiveFilename_(publicationDate, publisher, index + 1, originalName);
      file.moveTo(monthFolder);
      file.setName(archivedName);
      driveFileUrl = file.getUrl();

      const metadata = {
        formTimestamp: formResponse.getTimestamp().toISOString(),
        formResponseId: formResponse.getId(),
        driveFileId: file.getId(),
        driveFileUrl: driveFileUrl,
        driveFolderUrl: monthFolder.getUrl(),
        sheetRow: logSheet.getLastRow() + 1,
        submitterEmail: formResponse.getRespondentEmail() || '',
        publicationDate: publicationDate,
        publisher: publisher,
        page: cleanText_(responses[MCCIA_INTAKE.fields.page], 50),
        language: cleanText_(responses[MCCIA_INTAKE.fields.language], 100) || 'Unknown',
        headline: cleanText_(responses[MCCIA_INTAKE.fields.headline], 500) || 'Headline requires OCR review',
        presence: cleanText_(responses[MCCIA_INTAKE.fields.presence], 200) || 'MCCIA relevance requires review',
        notes: cleanText_(responses[MCCIA_INTAKE.fields.notes], 2000) || 'Submitted through the MCCIA team collection form.',
        sourceUrl: cleanText_(responses[MCCIA_INTAKE.fields.sourceUrl], 2000),
      };
      const response = UrlFetchApp.fetch(webhookUrl, {
        method: 'post',
        headers: { 'X-MCCIA-Intake-Secret': secret },
        payload: { file: file.getBlob().setName(archivedName), metadata: JSON.stringify(metadata) },
        muteHttpExceptions: true,
      });
      httpStatus = response.getResponseCode();
      const body = parseJson_(response.getContentText());
      if (httpStatus < 200 || httpStatus >= 300) throw new Error((body && body.error) || ('Dashboard returned HTTP ' + httpStatus));
      status = body.duplicate ? 'Duplicate connected' : 'Pending OCR';
      inboxId = body.record && body.record.id || '';
      duplicate = body.duplicate ? 'Yes' : 'No';
    } catch (error) {
      errorMessage = error && error.message ? error.message : String(error);
    }
    logSheet.appendRow([
      processedAt, formResponse.getTimestamp(), formResponse.getId(), formResponse.getRespondentEmail() || '',
      publicationDate, publisher, fileId, driveFileUrl, monthFolder.getUrl(), status, httpStatus,
      inboxId, duplicate, errorMessage, originalName, archivedName,
    ]);
  });
}

function validateForm_(form) {
  const requiredTitles = Object.keys(MCCIA_INTAKE.fields).map(function(key) { return MCCIA_INTAKE.fields[key]; });
  const existing = form.getItems().map(function(item) { return item.getTitle(); });
  const missing = requiredTitles.filter(function(title) { return existing.indexOf(title) === -1; });
  if (missing.length) throw new Error('Add these exact Google Form questions before setup: ' + missing.join(', '));
  const uploadItems = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  if (!uploadItems.length || uploadItems[0].getTitle() !== MCCIA_INTAKE.fields.clippingImages) {
    throw new Error('Add a File upload question named exactly "' + MCCIA_INTAKE.fields.clippingImages + '".');
  }
}

function installSubmitTrigger_(form) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onMcciaFormSubmit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onMcciaFormSubmit').forForm(form).onFormSubmit().create();
}

function getOrCreateRootFolder_() {
  const folders = DriveApp.getFoldersByName(MCCIA_INTAKE.rootFolderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(MCCIA_INTAKE.rootFolderName);
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function getOrCreateLogSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty('LOG_SPREADSHEET_ID');
  let spreadsheet;
  try {
    spreadsheet = existingId ? SpreadsheetApp.openById(existingId) : null;
  } catch (error) {
    spreadsheet = null;
  }
  if (!spreadsheet) spreadsheet = SpreadsheetApp.create(MCCIA_INTAKE.logSpreadsheetName);
  const sheet = spreadsheet.getSheetByName(MCCIA_INTAKE.logSheetName) || spreadsheet.getSheets()[0].setName(MCCIA_INTAKE.logSheetName);
  if (!sheet.getLastRow()) sheet.appendRow(LOG_HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setBackground('#194d36').setFontColor('#ffffff');
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(2, sheet.getMaxRows()), LOG_HEADERS.length).createFilter();
  return spreadsheet;
}

function getLogSheet_() {
  const spreadsheet = SpreadsheetApp.openById(requiredProperty_('LOG_SPREADSHEET_ID'));
  return spreadsheet.getSheetByName(MCCIA_INTAKE.logSheetName) || spreadsheet.insertSheet(MCCIA_INTAKE.logSheetName);
}

function responseMap_(formResponse) {
  const result = {};
  formResponse.getItemResponses().forEach(function(itemResponse) {
    const value = itemResponse.getResponse();
    result[itemResponse.getItem().getTitle()] = Array.isArray(value) ? value.join(', ') : value;
  });
  return result;
}

function fileUploadIds_(formResponse) {
  const result = [];
  formResponse.getItemResponses().forEach(function(itemResponse) {
    if (itemResponse.getItem().getType() !== FormApp.ItemType.FILE_UPLOAD) return;
    const value = itemResponse.getResponse();
    if (Array.isArray(value)) value.forEach(function(id) { if (id) result.push(String(id)); });
    else if (value) result.push(String(value));
  });
  return result;
}

function normalizeDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const text = cleanText_(value, 50);
  const match = text.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function archiveFilename_(date, publisher, sequence, originalName) {
  const extension = (originalName.match(/\.[A-Za-z0-9]{2,5}$/) || ['.jpg'])[0].toLowerCase();
  const safePublisher = publisher.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70) || 'Publisher';
  return date + '__' + safePublisher + '__' + Utilities.formatString('%02d', sequence) + extension;
}

function monthName_(month) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] || 'Unknown';
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Missing Script property: ' + name + '. Run setupMcciaIntake first.');
  return value;
}

function parseJson_(value) {
  try { return JSON.parse(value); } catch (error) { return null; }
}
