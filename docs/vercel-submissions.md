# Restore the Vercel submission service

The public archive is bundled with each release. Submission storage is a separate
private service. The website has no sign-in, submission inbox or approval step.
Authenticated Google Form automation publishes uploaded evidence automatically;
private submitter details remain accessible only to authorized maintenance routes.

## Production settings

In the existing MCCIA Vercel project, configure these **server-only** environment
variables. Do not use `NEXT_PUBLIC_` prefixes or commit their values.

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | URL of the project's durable libSQL/Turso database |
| `TURSO_AUTH_TOKEN` | Database access token |
| `S3_ENDPOINT` | Private S3-compatible endpoint, such as an R2 account endpoint |
| `S3_BUCKET` | Private evidence bucket name |
| `S3_ACCESS_KEY_ID` | Bucket-scoped access key |
| `S3_SECRET_ACCESS_KEY` | Corresponding secret |
| `S3_REGION` | Optional; defaults to `auto` for R2 |
| `MCCIA_EDITOR_KEY` | Optional maintenance access key, at least 32 characters; not needed for automatic uploads |
| `MCCIA_EDITOR_NAME` | Optional server-controlled name for the editor audit log |
| `MCCIA_EDITOR_AUTOMATION_SECRET` | Optional separate secret for authorized maintenance such as withdrawal; not used by upload processing |
| `GOOGLE_FORM_INTAKE_SECRET` | Optional separate automation ingestion secret |
| `GOOGLE_FORM_URL` | Optional override for the collection form URL |

The database tables and indexes are initialized by the service. If an earlier
Cloudflare deployment contains submissions, migrate its D1 rows and R2 objects
together before switching; creating an empty database does not migrate them.
Native Cloudflare deployments continue to use their existing D1/R2 bindings.

Keep the evidence bucket private. Browser reads go through routes that check
authorization for private submissions and publication status for public evidence.
Configure a one-day object-expiration rule for the `transfers/` prefix only,
to remove abandoned upload parts. Do not expire the `uploads/` or `form-intake/` data.
Redeploy after setting the variables.

Maintenance routes remain authenticated, including private reads and withdrawal.
Removing the public sign-in interface does not make submitter emails or Drive
links public. Automatically published evidence is labelled unverified, never
human-approved. Original files are preserved; a duplicate of an archived clipping
reuses its existing clipping ID and connected article.

## Installed Google Apps Script

Open the Apps Script project bound to the existing intake spreadsheet. Replace
its code with `google-apps-script/Pipeline.gs` and its manifest with
`google-apps-script/appsscript.json`. The checked-in target is
`https://mccia-media.vercel.app`; verify the installed `MI.dashboardUrl` agrees.

Run `setupMcciaMediaIntelligence` as the configured owner account. This installs
form-submit, five-minute delivery-retry, daily discovery and daily link-check
triggers, and removes the old sheet-edit approval trigger. The ingestion routes
validate the owner's Google access token. Optionally set
`GOOGLE_FORM_INTAKE_SECRET` in both Script Properties and Vercel to authenticate
transfers without repeated Google token checks. No editor key is required.

After upload: archive the original, run OCR where supported, extract metadata,
check duplicates and the source URL, then publish automatically. Failed deliveries
are retried. Previously delivered pending records are processed by ID without
another binary transfer. The website refreshes every minute and when the user
returns from the form. Invalid/future dates stop publication and remain in the
private error log; a genuinely missing date is displayed as unavailable.

Form files up to 100 MB are sent in authenticated 2 MB parts, with file checksums
verified before acceptance. This keeps each HTTP request within Vercel's request
body limit. OCR confidence remains unavailable when the OCR provider does not
return an actual measurement. A failed delivery is recorded as an error.

## Deployment acceptance check

1. Send a controlled form upload. Confirm its original and OCR appear in the
   archive automatically, with no website sign-in or approval click.
2. Verify anonymous users cannot read private submission details or maintenance
   logs. Public evidence must not include submitter email, Drive links or notes.
3. Send the same file again: both the sheet and server should identify the
   duplicate. Verify missing dates stay missing and future dates are rejected.
4. Test a file larger than 45 MB through the installed form automation. Confirm
   its SHA-256 and file size match the stored original.
5. Interrupt one delivery and confirm the retry trigger completes it. Withdraw
   a controlled test record using authorized maintenance and confirm retries
   never republish withdrawn evidence.
6. Confirm public uploads and monitoring follow all response pages. Service
   failures must not be represented as an empty, healthy archive.

These production steps require the project owner's Vercel and Apps Script
access. Local tests exercise authentication, withdrawal, transfers, pagination
and the editorial transaction, but cannot certify unconfigured remote services.

## Historical evidence limitations

The 1,488 checked-in historical clipping entries contain previews and, for some
entries, OCR excerpts. The available backup also contains these previews. Full
original files and complete OCR were not present in the inspected exports.
The viewer and exports explicitly label this absence. Do not rename previews
as originals or excerpts as full OCR. Recover original files from the source
archive and verify their recorded SHA-256 before attaching them; complete OCR
requires the original OCR export or a new transcription and review.
