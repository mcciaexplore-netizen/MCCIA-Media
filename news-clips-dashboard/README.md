# MCCIA News Clips Dashboard

A separate, read-only dashboard inspired by the supplied News Clips Dashboard PDF. The existing website and media-analytics-dashboard are unchanged.

## Run

Install Node.js if it is not already present. Double-click **start-dashboard.cmd**, then open **http://127.0.0.1:3003/**. Keep the terminal open while using the dashboard. Alternatively run `npm start` from this folder. No package installation is required. Set PORT to use another port.

The dashboard needs internet access to read the public MCCIA GitHub archive and available website APIs. It refreshes every five minutes while visible; the backend caches requests for one minute. This is a data reader, not a news-discovery scheduler. It does not write to Google Drive, GitHub or the main website.

## Features

- Shared month-range, collection, publisher, language, mention-category, topic and bilingual search filters.
- Coverage totals, publisher ranking, year counts, language mix, mention categories, monthly and weekday charts, publisher/year matrix.
- Sortable, paginated article register with safe source links.
- Shareable filter and page settings in the local URL, responsive layout and visible data connection status.

## Counting rules

Linked clipping evidence counts with its article once. Unlinked clippings and e-paper entries count separately. Exact file-hash duplicates from live uploads are reconciled. Known profile/index pages are excluded by the inherited archive model. Counts are record counts, never sums of row IDs or page numbers. E-paper entries can be individual issues or archive sources; they are not all newspaper articles.

Dates retain original precision. Month-only issues contribute to months but not weekdays. Items without a month are included by default and can be excluded. Year-only items are not silently assigned a month. Missing metadata is labelled, never guessed. The main archive's normalization and metadata inference logic is reused; counts do not establish editorial verification.

GitHub data is fetched at one immutable commit. Optional live API failures are displayed. A failed refresh keeps the last in-memory successful snapshot; there is no persistent offline cache. Unavailable live data may mean newer uploads/corrections are absent. No public upload storage is configured by this dashboard.

## Verify

Run `npm test` for date precision, count reconciliation, bilingual matching, linked-evidence deduplication and corrections checks.
