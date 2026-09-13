# Local Work tracker

This is an uncommitted, local implementation. It does not publish to GitHub, Vercel, Google Drive or the public media archive.

## Open

From this repository in PowerShell:

```powershell
$env:VERCEL='1'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001/work-tracker`. The development archive header also has a Work tracker link. The `VERCEL` setting only selects the existing Cloudflare compatibility configuration; it does not deploy anything.

## Data and workflow

- Records are saved in `.local-work-tracker/records.json`, excluded from Git. Back up that directory to retain local changes.
- Initial import: Publications 37, News & press releases 49, Sampada 12, Annual reports 1, Representations 5, Distribution 58. Distribution expands the recipient matrix into individual entries, including five publications missing recipients.
- `scripts/import_work_tracker.py <path-to-Media.xlsx>` creates initial data only. It refuses to overwrite an existing tracker. It requires the bundled Python runtime with openpyxl.
- The original sheet, row and cell values remain attached to each item. “Yes” and “Done” are ambiguous and are not converted into proof of release. Unlabelled dates are preserved as notes, not invented deadlines. Owners remain unassigned.
- List and board views, category/stage/owner/search filters, review/overdue/unassigned/completed counts, create/edit forms, source confirmation and change history are available.
- Printing, website upload and distribution are separate. Publication completion requires every release activity to be Done or Not required, with at least one Done. Website upload Done requires a link.
- Saving does not send a file, email, approval request or website publication. Document links remain references to existing files.
- Revision checks reject stale concurrent edits; writes are serialized and atomically replace the local JSON file. Do not run multiple independent tracker servers against the same data file.

## Access boundary

The tracker page and API are disabled outside development. The API also checks loopback hosts and same-origin requests. Run the server bound to 127.0.0.1. This is a local preview, not multi-user authentication. Shared storage, authenticated roles, approval permissions, notifications and explicit public publishing must be implemented and tested before deployment.

## Checks

```powershell
node --experimental-strip-types --import ./tests/register-loader.mjs --test tests/work-tracker*.test.mjs
```

The store test uses a temporary directory and does not modify the imported workbook records.


## September 11 local workflow improvements

- My work uses the signed-in name (or the Windows local-owner name before account setup), matching owner or reviewer. Needs attention spans categories. No deadline, due within seven days, pending reviews, follow-ups and import-review filters are explicit. Idle lists refresh every 30 seconds; open edits retain revision conflict protection.
- Actions validate the current category/stage and save with server-derived actor, time, comment and stage transition. Request changes requires a comment; review submission requires a reviewer. Printing, website and distribution are separate statuses. Actions only record progress, never send files or publish.
- The timeline distinguishes recorded forward transitions from unverified imported stages. Returning for changes does not mark review completed.
- Document links are append-only versions with contributor/time; working documents, final PDFs and supporting files can be opened directly. Files remain in your existing Drive or WorkDrive; this feature does not upload or copy them.
- Reviewer, priority and publication date are editable. Sampada has issue month/year and theme. Representations have acknowledgement/follow-up dates. Distribution has quantity, delivery method and receipt date.
- Import review shows original cells alongside current values and unresolved issues. Confirmation requires a resolution note. Original source cells cannot be replaced by client edits. Missing owners/deadlines remain visible even after source confirmation.

### Local team access and limits

Team access can be enabled by creating the first administrator in the local UI. No account or password has been created for the user automatically. Once enabled, all tracker reads/writes require a session. Administrators create named Reviewer, Editor and Viewer accounts. Passwords are salted and hashed; session tokens are stored as hashes with an eight-hour lifetime and sent only in an HttpOnly, SameSite cookie. Actors are resolved on the server; client actor fields are ignored. Editors cannot authorise approval stages and Viewers cannot mutate records. Account setup and route tests use temporary data, never the real workbook copy.

Records and access settings share the ignored `.local-work-tracker` directory. This is one local-server workspace, not a remote shared database. The process-local queues do not support multiple server processes. Keep the directory private and back it up before enabling sign-in. Password reset, account revocation, durable distributed rate limiting, HTTPS sessions and remote shared persistence remain deployment requirements. The development-only and loopback-only gates deliberately remain in place. No deployment, commit or push is authorised.
