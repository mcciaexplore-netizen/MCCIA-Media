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

## Date and metadata quality

Publication dates use `YYYY-MM-DD`. Numeric dates in legacy workbooks and CSVs
are read explicitly as day/month/year. Invalid and future publication dates
must be reviewed; missing dates are never replaced with today's date or the
first day of a month. A separately known year can be retained without a full date.
Existing record IDs remain permanent so clipping and source-audit links survive
subsequent imports.

Run `npm run data:check` after an import. Both production builds and the daily
collector run this check before publishing. It checks real dates, future dates,
year consistency, known languages, source URL structure, duplicate IDs, clipping
references and suspected day/month reversals against connected evidence.
Run `npm test` and `python -m unittest discover -s tests -p 'test_*.py'` for the
regression checks.

`npm run data:repair` applies only the reviewed date corrections and metadata
normalization. It preserves original merged records and changed values in
`archive-repair-history.json`; it never reverses all dates automatically.
The reviewed duplicates are searchable through their former IDs.

Analytics count connected clippings with their structured article once, and
unconnected clippings separately. Clippings reuse the connected article's known
language and people metadata. Missing years, languages and people stay visibly
labelled rather than being guessed. These labels do not imply that the original
newspaper omitted that information.

If the Google Apps Script pipeline is used separately, update its deployed code
from `google-apps-script/Pipeline.gs` to use the same explicit day-first parsing.
The website API also validates dates independently. Updating the repository does not update an already installed Apps Script project; follow [deployment setup](docs/vercel-submissions.md).

Vercel uses the repository-level `vercel.json` override to run the native
`next build` command and create `.next/routes-manifest.json`. The regular npm
build remains `vinext build` for the OpenAI Sites deployment.

## Automatic clipping uploads

Use **Add clipping** to upload evidence through the team Google Form. The installed
Apps Script archives the original file, runs OCR where supported, extracts metadata,
checks duplicates and source links, and sends it to the Vercel archive automatically.
There is no public editor sign-in, submission inbox or manual approval step.

Files up to 100 MB transfer in authenticated 2 MB parts. The server verifies the
original hash and deduplicates repeated files. Publication preserves the original,
exposes available OCR, and labels automatic metadata as unverified. Missing dates
remain unavailable; invalid or future dates are rejected. A withdrawn record cannot
be republished by a delivery retry. Private submission details stay protected.

The page refreshes uploads every minute and when returning from the form. Failed
deliveries retry every five minutes. Existing pending submissions can be processed
by ID without uploading their binary evidence again.

Vercel requires a durable libSQL database and a private S3-compatible evidence
bucket. Native Cloudflare deployments continue to use D1/R2. Follow
[Vercel and installed Apps Script setup](docs/vercel-submissions.md); changing the
repository alone does not configure storage or replace an installed script.

## Daily Google News discovery

The workflow in `.github/workflows/weekly-google-news.yml` runs every day at 08:45 IST and can also be started manually from GitHub Actions. It runs:

```bash
python scripts/fetch_google_news.py --days 10 --max-per-query 50
```

The collector monitors public Google News RSS results for:

- MCCIA and the Mahratta Chamber name;
- Director General / Prashant Girbane;
- MCCIA President;
- MCCIA leadership.

Discoveries are deduplicated into `app/google-news-alerts.json`. The release bundles these records with the archive and source audit. The daily data commit triggers the connected Vercel deployment, keeping the displayed records and audit consistent.

The same workflow audits new and 30-day-old public links with:

```bash
python scripts/verify_sources.py --stale-days 30
```

The audit output is stored in `app/source-verification.json`, with a detailed
review queue in `source_verification_report.json`. It checks reachability and
page-title agreement for every structured record. It does not automatically
change an editorial verification label.

Google News is a discovery channel, not an exhaustive archive or verification authority. Every automated record is labelled `Unverified` until an editor checks the publisher article and evidence.

## E-paper research

The **E-paper sources** dataset separates three things that should not be
confused:

- exact full public PDF evidence that was reviewed for a named MCCIA or
  Prashant Girbane mention;
- issue cards harvested from MCCIA's official Sampada archive, whose cover and
  issue link are verified but whose individual pages still need review;
- a labelled directory of official, subscription and legacy newspaper portals
  for Sakal, Loksatta, Lokmat, Maharashtra Times, Times of India, Indian
  Express, Saamana, Pudhari, Kesari and others.

Refresh the catalogue with:

```bash
python scripts/fetch_epaper_sources.py
```

The daily GitHub Action runs this collector together with Google News discovery
and source auditing. It links to publisher pages and cover thumbnails and does
not copy third-party newspaper pages or bypass subscriptions. The generated
`epaper_research_report.json` records the method, counts and known limitations.

## Evidence policy

- Original clipping images remain the evidence of record.
- Enhanced OCR copies are labelled derivative images and remain linked to the
  untouched original.
- OCR text is an AI-assisted transcription and can contain errors.
- Public source URLs, source candidates and unresolved records remain visibly distinguished.

## Coverage desk

The homepage includes a daily discovery digest, suggested story groups, monthly insights and website-only system alerts. Digest dates use the first discovery timestamp in India time, independently of publication dates. The collector preserves first-seen timestamps and records partial feed failures.

Story suggestions use matching article URLs or strongly similar headlines within three days. They never remove publisher records and do not claim cross-language story equivalence. Search recognises common English/Marathi names, publisher aliases and topics, with limited spelling tolerance; it is not a general translation engine.

Monthly Excel reports include a summary, all dated coverage items for the selected month, source/evidence links and publisher totals. Connected evidence is counted once. Missing-date records are excluded explicitly. Current months can be incomplete.

System alerts read public GitHub run status and private-storage aggregate health every five minutes while the page is open. They show failed, stale, partial and unavailable states without publishing private submission details. Pre-delivery failures in an unconnected Google Form script cannot yet reach the website. No email delivery is configured.
