// Used only by the native Next/Vercel build. The hosted Sites/vinext build
// resolves `cloudflare:workers` to the platform's real DB and file bindings.
export const env: Partial<Cloudflare.Env> = {
  GOOGLE_FORM_INTAKE_SECRET: process.env.GOOGLE_FORM_INTAKE_SECRET,
  GOOGLE_FORM_URL: process.env.GOOGLE_FORM_URL,
};
