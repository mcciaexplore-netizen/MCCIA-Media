declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    GOOGLE_FORM_INTAKE_SECRET?: string;
    GOOGLE_FORM_URL?: string;
  }
}
