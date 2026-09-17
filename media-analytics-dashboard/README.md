# MCCIA independent media analytics

Run `start-dashboard.cmd` on Windows (Node.js 20 or newer required), then open http://127.0.0.1:3002. Alternatively run `npm start` in this folder. Keep the server running while viewing. This is a separate HTML/CSS/JavaScript dashboard; it does not modify or publish the MCCIA website.

The small, local read-only server solves browser cross-origin restrictions. It reads public JSON datasets from one immutable GitHub main-branch commit and the website's public uploads, source-monitoring, corrections and version endpoints. No passwords, private Drive files, inbox data or tracker records are used. It binds only to this computer. Do not expose this development server directly to the internet.

Refresh runs every five minutes while visible, or manually (server cache: 60 seconds). It checks for existing published updates; it does not discover articles or process uploads. Failed optional sources are shown as unavailable, never as a confirmed zero. If a later full refresh fails, the last successful in-memory snapshot remains visibly marked stale. Restarting clears that cache. Version mismatches between GitHub and the deployed site are explicitly displayed.

Coverage counts include structured media records, e-paper entries and clippings not connected to a structured record (including merged ID aliases). Evidence is counted separately. Different publishers covering a story remain separate coverage items. Metadata rules in `lib/` were copied/transpiled from the local MCCIA application for consistency; they are not automatically downloaded or executed. Future changes to website normalization rules may require updating these copies.

All chart filters apply to the same coverage population. Full-archive OCR/matching statistics are explicitly labeled and do not change with coverage filters. Month-only publication dates retain month precision. Missing dates are never invented. Figures describe stored coverage, not impressions, reach, sentiment or source completeness. Historical URL audit failures are not fresh tests.

Run `npm test` for aggregation tests. No dependencies need installing. Opening index.html directly cannot connect to the local data endpoint; use the launcher above. No commit, push or hosting deployment has been performed for this dashboard.
