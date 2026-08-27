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
  approved_record_id TEXT,
  edition_city TEXT,
  media_type TEXT,
  ocr_text TEXT,
  ocr_confidence REAL,
  ocr_engine TEXT,
  duplicate_score REAL,
  duplicate_record_id TEXT,
  duplicate_reasons TEXT,
  link_status TEXT,
  link_http_status INTEGER,
  last_link_check TEXT,
  verification_status TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  updated_at TEXT
)`;

const intakeIndexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_google_form_intake_sha256 ON google_form_intake (sha256)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_google_form_intake_drive_file_id ON google_form_intake (drive_file_id) WHERE drive_file_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_status_received_at ON google_form_intake (status, received_at)',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_publication_date ON google_form_intake (publication_date)',
  'CREATE INDEX IF NOT EXISTS idx_google_form_intake_publisher ON google_form_intake (publisher)',
];

const createSourceMonitoringTable = `CREATE TABLE IF NOT EXISTS source_monitoring (
  id TEXT PRIMARY KEY NOT NULL,
  discovered_at TEXT NOT NULL,
  publication_date TEXT,
  publisher TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  presence TEXT NOT NULL,
  topic TEXT NOT NULL,
  source_url TEXT NOT NULL,
  discovery_type TEXT NOT NULL,
  query_text TEXT,
  link_status TEXT NOT NULL,
  http_status INTEGER,
  last_checked_at TEXT,
  verification_status TEXT NOT NULL,
  notes TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const sourceIndexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_source_monitoring_url ON source_monitoring (source_url)',
  'CREATE INDEX IF NOT EXISTS idx_source_monitoring_discovered_at ON source_monitoring (discovered_at)',
  'CREATE INDEX IF NOT EXISTS idx_source_monitoring_link_status ON source_monitoring (link_status, last_checked_at)',
];

const createAuditEventsTable = `CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  record_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  details TEXT,
  source TEXT NOT NULL
)`;

const auditIndexStatements = [
  'CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_events_record_id ON audit_events (record_id, created_at)',
];

const intakeAddedColumns: Record<string, string> = {
  edition_city: 'TEXT',
  media_type: 'TEXT',
  ocr_text: 'TEXT',
  ocr_confidence: 'REAL',
  ocr_engine: 'TEXT',
  duplicate_score: 'REAL',
  duplicate_record_id: 'TEXT',
  duplicate_reasons: 'TEXT',
  link_status: 'TEXT',
  link_http_status: 'INTEGER',
  last_link_check: 'TEXT',
  verification_status: 'TEXT',
  reviewed_by: 'TEXT',
  reviewed_at: 'TEXT',
  updated_at: 'TEXT',
};

async function ensureColumns(db: D1Database, table: string, columns: Record<string, string>) {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const present = new Set((result.results ?? []).map((column) => column.name));
  const missing = Object.entries(columns).filter(([name]) => !present.has(name));
  if (missing.length) {
    await db.batch(missing.map(([name, type]) => db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)));
  }
}

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
    db.prepare(createSourceMonitoringTable),
    db.prepare(createAuditEventsTable),
    ...intakeIndexStatements.map((statement) => db.prepare(statement)),
    ...sourceIndexStatements.map((statement) => db.prepare(statement)),
    ...auditIndexStatements.map((statement) => db.prepare(statement)),
  ]);
  await ensureColumns(db, 'google_form_intake', intakeAddedColumns);
  await db.prepare('PRAGMA optimize').run();
}
