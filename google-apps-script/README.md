# Google Drive and Sheets upload connection

Use **mccianewsclipping@gmail.com** for this installation. The website code supports this connection, but it is not active until the owner deploys this script and connects Vercel.

## Install once

1. Open the existing News Upload Apps Script project in the Newsclipping account. Replace Code.gs with the complete contents of `Pipeline.gs` in this folder. Save a backup of the old script first.
2. Open Project settings, enable **Show appsscript.json manifest file**, and replace that file with this folder's `appsscript.json`. It enables Drive API v3 and the required permissions.
3. Select **setupMcciaMediaIntelligence** in the function selector, then click Run and authorize it. Do not manually run `onMcciaFormSubmit`: that function receives its event from a real Form submission.
4. Setup makes the archive folder and intake spreadsheet private, prepares their columns, and installs the Form trigger, five-minute retry trigger, daily discovery around 8:45 AM India time, and daily link checks. Existing directly shared child files should also be checked in Drive; making a parent private does not revoke separately granted child permissions.
5. Choose **Deploy → New deployment → Web app**. Execute as **Me (mccianewsclipping@gmail.com)**. Set access to **Anyone**. The web endpoint requires signed requests from the website; it does not publish the folder or spreadsheet. Copy the deployment URL ending in `/exec`.
6. In Project settings → Script properties, copy the generated **DRIVE_GATEWAY_SECRET** privately. Do not paste it into chat, source code, the spreadsheet, or a public issue.
7. In Vercel → MCCIA-Media → Settings → Environment Variables, add these to Production:
   - **DRIVE_GATEWAY_URL**: the `/exec` deployment URL.
   - **DRIVE_GATEWAY_SECRET**: the exact Script property value.
8. Redeploy the Vercel project so the new settings take effect. For later script changes, update the web app deployment to a **new version** while retaining its URL.

## Verify the whole workflow

Submit one small, readable clipping through the actual Google Form. In the intake sheet, its status should progress to **Auto-published**. Reload the website's Clipping Evidence view, open the article, confirm the original image/PDF and extracted text, and test its report evidence link. Media briefing's System alerts should report the connection and any failed processing attempts. Test one Marathi and one English clipping before relying on unattended processing.

There is no approval step. Image/PDF OCR failures stay unpublished and retry automatically with backoff. A long OCR result is saved as a private text file because a Sheets cell cannot hold unlimited text. No artificial OCR confidence percentage is reported. Language hints are supplied only when the form specifies a supported language; otherwise OCR uses automatic detection. Metadata classification is inferred from available text and is not editorial verification.

Only rows marked **Auto-published** are exposed through the website. The gateway returns public metadata and streams only the file associated with a published row. Submitter emails, internal notes, Drive IDs and private Drive URLs are omitted. Change Processing status to **Withdrawn** in the private sheet to remove an item from subsequent website requests. Open website sessions refresh uploads every minute while visible; reload to check immediately. Previously downloaded public copies cannot be recalled.

The website fetches new data when opened, every minute while visible, and when returning from the form. This is polling rather than a push connection. Apps Script quotas and execution limits apply; start with modest volumes. Large PDFs/videos require multiple streaming requests and need end-to-end testing under the account's quotas. The 100 MB limit is a maximum acceptance limit, not a guarantee that OCR can process every file of that size.

## Historical archive limitations

This connection processes new uploads. It does not invent missing publication dates or regenerate old OCR automatically. The existing archive still needs source recovery for missing originals/full text, ambiguous clipping matches, and undated records. Historical unreachable-link findings are stored audit results until retested. Legacy R2/Turso routes remain available as a fallback but are not required for this Drive workflow.

Official references: [Deploy an Apps Script web app](https://developers.google.com/apps-script/guides/web) and [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).
