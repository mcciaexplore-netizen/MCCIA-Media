import { env } from 'cloudflare:workers';

const createUploadsTable = `CREATE TABLE IF NOT EXISTS clipping_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  original_key TEXT NOT NULL,
  enhanced_key TEXT NOT NULL,
  original_content_type TEXT NOT NULL,
  enhanced_content_type TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  enhanced_size INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  publisher TEXT NOT NULL,
  publication_date TEXT NOT NULL,
  page TEXT,
  language TEXT NOT NULL,
  headline TEXT NOT NULL,
  ocr_text TEXT NOT NULL,
  ocr_confidence REAL,
  ocr_languages TEXT NOT NULL,
  presence TEXT NOT NULL,
  status TEXT NOT NULL,
  reviewed INTEGER NOT NULL,
  notes TEXT NOT NULL,
  source_url TEXT
)`;

const indexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_clipping_uploads_sha256 ON clipping_uploads (sha256)',
  'CREATE INDEX IF NOT EXISTS idx_clipping_uploads_publication_date ON clipping_uploads (publication_date)',
  'CREATE INDEX IF NOT EXISTS idx_clipping_uploads_publisher ON clipping_uploads (publisher)',
  'CREATE INDEX IF NOT EXISTS idx_clipping_uploads_uploaded_at ON clipping_uploads (uploaded_at)',
];

const createFormIntakeTable = `CREATE TABLE IF NOT EXISTS google_form_intake (
  id TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  form_timestamp TEXT,
  form_response_id TEXT,
  drive_file_id TEXT,
  drive_file_url TEXT,
  drive_folder_url TEXT,
  sheet_row INTEGER,
  submitter_email TEXT,
  original_filename TEXT NOT NULL,
  original_key TEXT NOT NULL,
  original_content_type TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  publication_date TEXT NOT NULL,
  publisher TEXT NOT NULL,
  page TEXT,
  language TEXT NOT NULL,
  headline TEXT NOT NULL,
  presence TEXT NOT NULL,
  notes TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  approved_at TEXT,
  approved_record_id TEXT
)`;

const intakeIndexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_google_form_intake_sha256 ON google_form_intake (sha256)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_google_form_intake_drive_file_id ON google_form_intake (drive_file_id) WHERE drive_file_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_status_received_at ON google_form_intake (status, received_at)',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_publication_date ON google_form_intake (publication_date)',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_publisher ON google_form_intake (publisher)',
];

export function getStorageBindings() {
  if (!env.DB || !env.FILES) {
    throw new Error('Persistent clipping storage is unavailable in this deployment.');
  }
  return { db: env.DB, files: env.FILES };
}

export function getGoogleFormIntakeSecret() {
  return env.GOOGLE_FORM_INTAKE_SECRET?.trim() || '';
}

export async function ensureUploadsSchema(db: D1Database) {
  await db.batch([
    db.prepare(createUploadsTable),
    ...indexStatements.map((statement) => db.prepare(statement)),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

export async function ensureFormIntakeSchema(db: D1Database) {
  await db.batch([
    db.prepare(createFormIntakeTable),
    ...intakeIndexStatements.map((statement) => db.prepare(statement)),
  ]);
  await db.prepare('PRAGMA optimize').run();
}
