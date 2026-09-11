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

The preferred backend is now private Google Drive for evidence and Google Sheets for metadata. Deploy the signed Apps Script gateway as **mccianewsclipping@gmail.com**, then configure `DRIVE_GATEWAY_URL` and `DRIVE_GATEWAY_SECRET` in Vercel. Follow the [complete Drive installation guide](google-apps-script/README.md). This configuration has not been activated merely by publishing the code.

Images and PDFs publish after OCR produces text. Failed OCR retries automatically with backoff; the website reports pending processing. Language, people, topics and DG attribution are inferred from available text and remain unverified. Missing dates remain unavailable; invalid/future dates are rejected. Original files and full text stay private in Drive and are exposed through the website only for published rows, without submitter details or private Drive links. The website refreshes uploads each minute while visible and when returning from the form.

Legacy libSQL/S3 and Cloudflare D1/R2 backends remain supported. Their temporary upload chunks are indexed and cleaned on incoming transfers and automation health updates. They are not required for the Drive workflow. The older [Vercel submissions guide](docs/vercel-submissions.md) describes that fallback.

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


## Article reader and archive cleanup

- Every record and clipping has a Read article button: preserved evidence, available OCR (or an explicit unavailable label), the publisher source and closely related coverage appear together.
- Report an error prepares a GitHub issue from inside the reader. Reports are public and require the team member to sign in to GitHub and submit; preparing the link does not send a report.
- Broad topic labels are inferred conservatively from English and Marathi headline keywords; specific existing topics are preserved, and unmatched headlines remain Topic not assigned.
- Automatic RSS inclusion requires an explicit MCCIA/chamber/Prashant Girbane mention in the headline. Search-query matches, feed descriptions and generic industry terms are insufficient. This deliberately trades recall for relevance; a relevant story that names MCCIA only in its body may be omitted. The excluded historic discovery IDs are retained in app/discovery-exclusions.json for review.
- Collection history records up to 365 completed feed collections, with additions and failed watch names. History begins with the next scheduled run. Entirely failed workflow attempts remain visible through the workflow run link and System alerts.
- Upload activation still requires durable storage and the owner-authorized Apps Script setup. The newly shared container-bound Apps Script was an empty starter project with Viewer-only access from the available browser account; its existence does not establish a working pipeline.


## Navigation, reports and authorised corrections

The compact sticky header offers Archive, Media briefing, Reports and About, with an Add clipping link and a mobile menu. Archive export applies to the visible filtered results. Reports supports publication date ranges, topic and publisher selection; Excel cells remain typed strings rather than executable formulas.

The reader can compare up to four strongly related coverage items side by side. Direct metadata correction is separately protected by editor authentication and same-origin checks. It requires the configured durable storage and MCCIA_EDITOR_KEY; it is not activated merely by publishing this code. Corrections are stored as overlays, with an audit row containing the server-derived actor and reason, and optimistic version checks to prevent overwriting newer edits. The public correction feed exposes only published title/date patches. Archived clipping IDs and published upload IDs support the same authenticated correction workflow. Drive-backed corrections use a private sheet and audit trail.

## Automatic metadata

Missing language, topic, people/organisation and DG participation are suggested from available headlines and OCR. Existing supplied values are retained. Marathi and Hindi use word evidence; ambiguous Devanagari stays Marathi / Hindi, and insufficient text stays unrecorded. People detection recognises named MCCIA entities rather than treating any Director General as Prashant Girbane. A mention alone does not imply a quote, authored article or interview. These suggestions are not editorial verification.

The Apps Script includes the same rules (tested for parity), adds Topic to the submission log, and setup makes Language and People / organisation questions optional. Replace Code.gs and rerun setupMcciaMediaIntelligence as mccianewsclipping@gmail.com to activate the changes. Durable website storage remains required for delivery.

## September audit fixes

Report input now includes all 64 e-paper entries while preserving month precision. The four confirmed profile/index IDs PG2527, PG2528, PG2561 and PG2562 remain in the source dataset but are excluded from displayed coverage. Topics use the same article/unlinked-clipping collection as the other charts. Reports, briefing and article readers restore from URL state; prepared report downloads become invalid after data changes. Relative evidence URLs work in readers and become absolute in Excel exports. Search supports partial names and advertised Marathi aliases.

Historical missing dates, missing original/full OCR files, ambiguous matches and stored unreachable-link results still require source recovery and verification. The new upload pipeline does not imply those historical gaps have been repaired.
