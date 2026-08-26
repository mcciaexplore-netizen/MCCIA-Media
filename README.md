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

Google News is a discovery channel, not an exhaustive archive or verification authority. Every automated record is labelled `Unverified` until an editor checks the publisher article and evidence.

## Evidence policy

- Original clipping images remain the evidence of record.
- OCR text is an AI-assisted transcription and can contain errors.
- Public source URLs, source candidates and unresolved records remain visibly distinguished.
