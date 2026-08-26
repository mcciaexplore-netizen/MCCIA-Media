# MCCIA Google Form intake setup

This package connects a team Google Form to the private MCCIA Media Intelligence dashboard.

## 1. Create the Google Form

Create a form titled **MCCIA Newspaper Clipping Submission** and add these questions with the exact titles below. Collecting verified email addresses is optional; enable it only after the team agrees that submitter identities should be stored in the log.

1. **Publication date** — Date, required.
2. **Publisher / news channel** — Short answer, required.
3. **Newspaper clipping image(s)** — File upload, required; image files only; maximum 10 files; maximum 10 MB per file.
4. **Page number** — Short answer, optional.
5. **Language** — Dropdown: Marathi, English, Hindi, Bilingual, Unknown.
6. **People / organisation** — Multiple choice: MCCIA; Director General / Prashant Girbane; MCCIA President; Other MCCIA representative; MCCIA relevance requires review.
7. **Headline, if readable** — Short answer, optional.
8. **Public source URL, if known** — Short answer, optional.
9. **Notes for the editor** — Paragraph, optional.

Google requires respondents to sign in for a File upload question. Keep the form restricted to the intended MCCIA team until its access list has been approved.

## 2. Add the Apps Script

From the form, open **More > Apps Script**, or create a standalone Apps Script project. Replace `Code.gs` with this folder's `Code.gs`. The checked-in script contains this form's ID so either project type works. In **Project Settings**, enable “Show appsscript.json” and replace the manifest with `appsscript.json`.

In **Project Settings > Script properties**, add:

- `MCCIA_INTAKE_SECRET` — the same private secret configured on the Sites deployment.
- `DASHBOARD_WEBHOOK_URL` — `https://mccia-media-monitor.guptaaarushi592.chatgpt.site/api/form-intake`

Do not place the secret inside the source file or Google Sheet.

Run `setupMcciaIntake` once and authorize the requested Form, Drive, Sheets, external request, and trigger permissions. The setup validates the question titles, creates the permanent Drive archive and log Sheet, and installs the submit trigger.

## 3. Created archive structure

The script creates:

```text
MCCIA Media Intelligence/
└── Newspaper Clippings/
    └── YYYY/
        └── MM-Month/
            └── YYYY-MM-DD__Publisher__01.jpg
```

Every image is moved into its Year/Month folder. Every webhook attempt is appended to **MCCIA Clipping Submission and Error Log**, including its Drive URL, HTTP status, dashboard inbox ID, duplicate result, and error message.

## 4. Editorial workflow

1. Team submits the clipping from a phone or desktop.
2. Drive stores it permanently under Year/Month.
3. Apps Script logs the attempt and sends a private copy to the Dashboard Inbox.
4. An editor opens **Submission inbox > Enhance & OCR**.
5. Only after the editor checks the image, OCR, date, publisher, headline and people/organisation fields does the dashboard create an approved Clipping Evidence record.

Rejected submissions stay in the inbox audit trail and never appear in the main Clipping Evidence archive.
