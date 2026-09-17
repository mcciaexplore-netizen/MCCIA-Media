# Connect Zoho sign-in to the local work tracker

This connection verifies identity only. It cannot read or send mail. The tracker still stores its records on this computer; this does not enable remote team access or deploy the tracker.

1. Open https://api-console.zoho.in/ with the MCCIA administrator's Zoho account. Choose **Server-based Applications** and register **MCCIA Work Tracker**.
2. Set the homepage to `http://127.0.0.1:3001/work-tracker` and the authorised redirect URI to `http://127.0.0.1:3001/api/work-tracker/zoho/callback`. If Zoho requires localhost for local development, use localhost in BOTH the redirect setting and the browser address throughout sign-in.
3. Add these values to `.env.local` in this project. Keep the client secret private; never commit this file or paste the secret in chat.

```dotenv
ZOHO_CLIENT_ID=your-client-id
ZOHO_CLIENT_SECRET=your-client-secret
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_REDIRECT_URI=http://127.0.0.1:3001/api/work-tracker/zoho/callback
ZOHO_TEAM_ROLES='{"aarushig@mcciapune.com":"Administrator"}'
```

The email shown is the address supplied in the earlier screenshot. Verify it with your administrator before configuration. Add each approved MCCIA email explicitly with Administrator, Reviewer, Editor or Viewer. No role is granted merely for having the company email domain. Roles are applied on the next Zoho login; existing sessions last up to eight hours.

4. Restart the local server, open the tracker and click **Sign in with Zoho**. Use the same hostname as the redirect URI. The app requests only `openid email profile`.
5. Test with an approved account, then an unapproved account. Check the displayed role and permissions. Keep the local administrator account until real Zoho sign-in has been tested successfully.

Use the same data centre for the app and team accounts. This implementation supports one configured data centre; it does not follow arbitrary callback server URLs. Browser-bound, expiring, one-use state and PKCE protect the flow. Signed identity tokens are checked for issuer, audience, expiry, nonce and verified email. Zoho identities use the immutable subject; existing local users are not automatically linked by name or email. No Zoho access or refresh tokens are stored.

Real-account verification requires the application credentials. The callback remains development-only, like the tracker. Shared production storage, HTTPS deployment and production session administration are separate work.

Reference: https://www.zoho.com/developer/oauth/sign-in-using-zoho-oidc.html
