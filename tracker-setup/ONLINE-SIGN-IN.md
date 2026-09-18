# Password sign-in activation

No Zoho settings or WT_SESSION_SECRET are required. Keep the existing DRIVE_GATEWAY_URL and DRIVE_GATEWAY_SECRET on Vercel and in the ignored local .env.local.

1. Replace the installed Code.gs with this folder's updated Code.gs. Deploy a new version of the existing gateway, keeping its URL and secret.
2. Deploy the website changes.
3. On the editor computer, sign into the local tracker as Administrator, then open http://127.0.0.1:3001/work-tracker/setup-online. Set a separate 12–200 character password for aarushig@mcciapune.com. This one-time setup endpoint is disabled in production. Never send the password in chat.
4. Sign into https://mccia-media.vercel.app/work-tracker/sign-in with that email and Work Tracker password.
5. Use Manage team to add/reset passwords and assign Administrator or Editor roles. At least one administrator must remain. Deletion revokes access; password resets invalidate prior sessions. Share account passwords with members privately, never in the public tracker.

The private Tracker Password Access sheet contains salted scrypt hashes and hashed session tokens, not plain passwords. It must remain private. Public views never return these rows. Sessions last eight hours, logouts revoke them, and login attempts are rate-limited in durable storage. Email domains are restricted to mcciapune.com but mailbox ownership is not verified by password sign-in.

Full private tracker records and editing remain local. This update adds online sign-in and team access only; the full private-record migration is still a separate pending decision. Existing local accounts are preserved and not automatically copied online.
