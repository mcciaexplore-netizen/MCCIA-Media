# MCCIA automated media-intelligence pipeline

This Apps Script belongs to **MCCIA Media & Newspaper Clipping Submission** in
`mccianewsclipping@gmail.com`.

## What it automates

- Moves each uploaded evidence file into the permanent `YYYY/MM-Month` Drive archive.
- Runs Google Drive OCR immediately for images and PDFs.
- Scores possible duplicates using binary SHA-256, publication date, headline similarity,
  OCR/image-content similarity, publisher and file-size similarity.
- Creates native `Pending`, `Approved` and `Rejected` editorial controls in the
  **Submissions** sheet.
- Sends intake records and approved evidence to the dashboard.
- Searches Google News RSS, MCCIA RSS and the MCCIA Sampada portal each Monday.
- Checks source URLs daily and flags broken links.
- Maintains **Source Monitoring**, **Analytics**, **Audit Log** and **Errors** sheets.

## Installation

1. Open a new Apps Script project while signed in as `mccianewsclipping@gmail.com`.
2. Replace the default script with `Pipeline.gs` and replace the manifest with
   `appsscript.json`.
3. Run `setupMcciaMediaIntelligence` once and approve the requested Form, Drive,
   Docs, Sheets, external-request and trigger permissions.

The setup function validates the exact 12 Form questions, prepares the existing
**MCCIA Clipping Intake Log**, and installs four triggers:

- Google Form submission
- Google Sheet editorial-status edit
- weekly source discovery
- daily link health monitoring

The dashboard accepts the short-lived Google OAuth token only when it belongs to
`mccianewsclipping@gmail.com`; no shared secret is stored in source code or in the Sheet.

## Editorial workflow

1. New files are archived and OCR-processed immediately.
2. Duplicate and verification signals are written to the submission row.
3. An editor selects `Pending`, `Approved` or `Rejected` in **Editorial status**.
4. An approved item is added automatically to the dashboard's Clipping Evidence data.
5. Every submission, status change, discovery run and link-monitor run is recorded.

OCR and duplicate scoring assist the editor; they do not replace source verification.
