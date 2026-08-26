// Used only by the native Next/Vercel build. The hosted Sites/vinext build
// resolves `cloudflare:workers` to the platform's real DB and file bindings.
export const env: Partial<Cloudflare.Env> = {};
