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

export function getStorageBindings() {
  if (!env.DB || !env.FILES) {
    throw new Error('Persistent clipping storage is unavailable in this deployment.');
  }
  return { db: env.DB, files: env.FILES };
}

export async function ensureUploadsSchema(db: D1Database) {
  await db.batch([
    db.prepare(createUploadsTable),
    ...indexStatements.map((statement) => db.prepare(statement)),
  ]);
  await db.prepare('PRAGMA optimize').run();
}
