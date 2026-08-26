# MCCIA Media Intelligence

An auditable dashboard for MCCIA media records and supplied newspaper clipping evidence, including coverage related to Director General Prashant Girbane and MCCIA leadership.

## Local development

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run lint
npm run build
```

Vercel uses the repository-level `vercel.json` override to run the native
`next build` command and create `.next/routes-manifest.json`. The regular npm
build remains `vinext build` for the OpenAI Sites deployment.

## Add and read newspaper clippings

Use **Add clipping** in the dashboard header to process a JPG, PNG or WebP
newspaper image (maximum 20 MB). The browser:

- preserves the original file without alteration;
- creates a separate enlarged, grayscale, auto-contrasted and sharpened WebP;
- runs Tesseract.js OCR with selectable English, Marathi and Hindi models;
- proposes the publisher, date, page, language, headline and relevant MCCIA
  person or organisation;
- requires an editor to compare and correct the extracted fields before saving.

Reviewed metadata is stored in D1 and original/enhanced images are stored in R2.
An exact SHA-256 match reuses the existing clipping instead of creating a
duplicate. Saved uploads appear in the **Clipping evidence** archive, work with
the archive filters and are included in the clipping CSV export.

OCR processing runs locally in the user's browser, but the language model files
must be downloaded when a language is used for the first time. PDF clippings
should be exported as a clear page image before upload. OCR text is not factual
verification, and an enhanced copy never replaces the original evidence.

## Weekly Google News discovery

The workflow in `.github/workflows/weekly-google-news.yml` runs every Monday at 08:45 IST and can also be started manually from GitHub Actions. It runs:

```bash
python scripts/fetch_google_news.py --days 10 --max-per-query 50
```

The collector monitors public Google News RSS results for:

- MCCIA and the Mahratta Chamber name;
- Director General / Prashant Girbane;
- MCCIA President;
- MCCIA leadership.

Discoveries are deduplicated into `app/google-news-alerts.json`. The live client reads that public GitHub file, so a weekly data commit can appear without changing the dashboard code.

The same workflow audits new and 30-day-old public links with:

```bash
python scripts/verify_sources.py --stale-days 30
```

The audit output is stored in `app/source-verification.json`, with a detailed
review queue in `source_verification_report.json`. It checks reachability and
page-title agreement for every structured record. It does not automatically
change an editorial verification label.

Google News is a discovery channel, not an exhaustive archive or verification authority. Every automated record is labelled `Unverified` until an editor checks the publisher article and evidence.

## Evidence policy

- Original clipping images remain the evidence of record.
- Enhanced OCR copies are labelled derivative images and remain linked to the
  untouched original.
- OCR text is an AI-assisted transcription and can contain errors.
- Public source URLs, source candidates and unresolved records remain visibly distinguished.
