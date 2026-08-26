#!/usr/bin/env python3
"""Refresh the dashboard's public e-paper source catalogue.

The collector deliberately limits itself to publisher-controlled or otherwise
publicly accessible index pages. It stores links and cover thumbnails; it does
not copy third-party newspaper pages or bypass subscriptions.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
MCCIA_ARCHIVE = "https://www.mcciapune.com/publications/publication-sampada/"
USER_AGENT = "MCCIA-Media-Intelligence/1.0 (+public source catalogue)"

PORTALS = [
    {
        "publisher": "MCCIA Sampada",
        "edition": "Official MCCIA periodical",
        "url": MCCIA_ARCHIVE,
        "access": "Public issue archive",
        "coverage": "Jan 2021 onward, plus separately indexed older PDFs",
        "notes": "Publisher-controlled issue index with cover images and issue links.",
        "verification": "Official publisher portal",
    },
    {
        "publisher": "Sakal",
        "edition": "Pune / selectable editions",
        "url": "https://epaper.esakal.com/smartepaper/UI/",
        "access": "Portal; archive controls may require sign-in",
        "coverage": "Date and edition selector",
        "notes": "Use Marathi and English spellings when searching issue text.",
        "verification": "Official e-paper portal",
    },
    {
        "publisher": "Loksatta",
        "edition": "Pune",
        "url": "https://epaper.loksatta.com/",
        "access": "Subscription / login may apply",
        "coverage": "Current and archived editions",
        "notes": "The public Loksatta website links directly to this e-paper service.",
        "verification": "Official e-paper portal",
    },
    {
        "publisher": "Lokmat",
        "edition": "Pune Main",
        "url": "https://epaper.lokmat.com/home.php",
        "access": "Public portal; issue access varies",
        "coverage": "Date and edition selector",
        "notes": "Pune Main is the principal edition for the MCCIA search scope.",
        "verification": "Official e-paper portal",
    },
    {
        "publisher": "Maharashtra Times",
        "edition": "Pune",
        "url": "https://epaper.timesgroup.com/maharashtratimes/",
        "access": "Times e-paper account may be required",
        "coverage": "Current and archived editions",
        "notes": "Times Group Marathi e-paper portal.",
        "verification": "Official publisher portal",
    },
    {
        "publisher": "The Times of India",
        "edition": "Pune",
        "url": "https://epaper.indiatimes.com/timesepaper/publication-the-times-of-india%2Ccity-pune.cms",
        "access": "Times e-paper account may be required",
        "coverage": "Pune edition",
        "notes": "Direct Pune-edition landing page.",
        "verification": "Official publisher portal",
    },
    {
        "publisher": "The Indian Express",
        "edition": "Pune",
        "url": "https://pdf.indianexpress.com/ieepaper/ie/pune/",
        "access": "Public landing page; subscription may apply",
        "coverage": "Pune edition",
        "notes": "Indian Express Pune e-paper landing page.",
        "verification": "Official publisher portal",
    },
    {
        "publisher": "Express Group ePaper Archive",
        "edition": "Pune",
        "url": "https://epaperarchive.indianexpress.com/edition/Pune/643",
        "access": "Archive portal; login may apply",
        "coverage": "Express Group Pune archive",
        "notes": "Useful for Loksatta and Indian Express archive discovery.",
        "verification": "Official publisher archive",
    },
    {
        "publisher": "Saamana",
        "edition": "Pune / selectable editions",
        "url": "https://epaper.saamana.com/",
        "access": "Public portal; issue access varies",
        "coverage": "Date and edition selector",
        "notes": "Official Saamana e-paper portal.",
        "verification": "Official e-paper portal",
    },
    {
        "publisher": "Pudhari",
        "edition": "Pune / selectable editions",
        "url": "https://epaper.pudhari.news/",
        "access": "Public portal; issue access varies",
        "coverage": "Date and edition selector",
        "notes": "Official Pudhari e-paper portal.",
        "verification": "Official e-paper portal",
    },
    {
        "publisher": "Kesari",
        "edition": "Pune",
        "url": "https://www.magzter.com/IN/Kesari-Mahratta-Trust/Kesari-Pune/Newspaper/All-Issues",
        "access": "Third-party subscription archive",
        "coverage": "All-issues catalogue",
        "notes": "Kesari Pune archive hosted by Magzter; not the similarly named Ekta Kesari.",
        "verification": "Publisher-labelled third-party archive",
    },
    {
        "publisher": "Dainik Prabhat",
        "edition": "Legacy e-paper service",
        "url": "http://epaper.eprabhat.net/",
        "access": "Legacy portal; availability varies",
        "coverage": "Historical portal",
        "notes": "Kept as a research lead; confirm availability before relying on a result.",
        "verification": "Legacy portal lead",
    },
    {
        "publisher": "Hindustan Times",
        "edition": "Legacy e-paper viewer",
        "url": "http://paper.hindustantimes.com/epaper/viewer.aspx",
        "access": "Legacy portal; availability varies",
        "coverage": "Historical e-paper viewer",
        "notes": "Kept as a research lead; current access may redirect or require a subscription.",
        "verification": "Legacy portal lead",
    },
]


def fetch_text(url: str, timeout: int) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", "replace")


def parse_sampada(html_text: str) -> list[dict]:
    card_pattern = re.compile(
        r'<a\s+href="(?P<url>[^"]+)"[^>]*>\s*'
        r'<img[^>]+src="(?P<cover>[^"]*CoverImages[^"]*)"[^>]*>\s*</a>'
        r'.*?<p[^>]*>(?P<label>[A-Z][a-z]{2}\s+20\d{2})\s*</p>',
        re.IGNORECASE | re.DOTALL,
    )
    records: list[dict] = []
    seen: set[str] = set()
    for match in card_pattern.finditer(html_text):
        label = html.unescape(match.group("label")).strip()
        issue_date = datetime.strptime(label, "%b %Y")
        record_id = f"EP-SAMPADA-{issue_date:%Y-%m}"
        if record_id in seen:
            continue
        seen.add(record_id)
        issue_url = urljoin(MCCIA_ARCHIVE, html.unescape(match.group("url")))
        cover_url = urljoin(MCCIA_ARCHIVE, html.unescape(match.group("cover")))
        records.append(
            {
                "id": record_id,
                "date": f"{issue_date:%Y-%m}-01",
                "year": issue_date.year,
                "type": "PDF",
                "format": "Official e-paper issue",
                "publisher": "MCCIA Sampada",
                "title": f"Sampada — {issue_date:%B %Y}",
                "language": "English / Marathi",
                "presence": "MCCIA (named-person presence not yet reviewed)",
                "topic": "MCCIA official e-paper",
                "description": "Issue listed in MCCIA's official Sampada archive. The archive link and cover are publisher-verified; individual named-person mentions still require issue-level review.",
                "status": "Partially verified",
                "url": issue_url,
                "mediaUrl": cover_url,
                "evidenceImageUrl": None,
                "notes": "Official MCCIA issue listing. Do not infer that every article or page contains a named-person mention without checking the issue.",
                "sourceSearchStatus": "official-epaper-index",
                "sourceDataset": "Official MCCIA Sampada archive",
                "verificationMethod": "Official publisher index; issue content review pending",
                "epaperKind": "MCCIA periodical",
                "access": "Public issue page",
                "archiveUrl": MCCIA_ARCHIVE,
            }
        )
    return records


def exact_public_evidence() -> list[dict]:
    return [
        {
            "id": "EP-SAMPADA-2020-03",
            "date": "2020-03-10",
            "year": 2020,
            "type": "PDF",
            "format": "Official e-paper PDF",
            "publisher": "MCCIA Sampada",
            "title": "Sampada — March 2020",
            "language": "English",
            "presence": "Prashant Girbane — Printer, Publisher and Editor; Director General, MCCIA",
            "topic": "MCCIA official e-paper",
            "description": "The official March 2020 Sampada PDF identifies Prashant Girbane as Printer, Publisher and Editor and as Director General of MCCIA.",
            "status": "Verified",
            "url": "https://www.mcciapune.com/media/Publication/Publication_File/March_2020.pdf",
            "mediaUrl": None,
            "evidenceImageUrl": None,
            "notes": "Exact name and role are visible in the publisher-controlled PDF colophon dated 10 March 2020.",
            "sourceSearchStatus": "exact-public-pdf",
            "sourceDataset": "Official MCCIA Sampada PDF",
            "verificationMethod": "Full public PDF text reviewed",
            "epaperKind": "MCCIA periodical",
            "access": "Public PDF",
            "archiveUrl": MCCIA_ARCHIVE,
        },
        {
            "id": "EP-NEWSEXPRESS-2024-04-17",
            "date": "2024-04-17",
            "year": 2024,
            "type": "PDF",
            "format": "Newspaper e-paper PDF",
            "publisher": "News Express Marathi / Maha eNews",
            "title": "उद्योगांना पूरक पायाभूत सुविधांची बोंब!",
            "language": "Marathi",
            "presence": "Prashant Girbane — Director General, MCCIA (quoted)",
            "topic": "Industrial infrastructure",
            "description": "A full public e-paper PDF carries the report on page 4 and attributes an industrial-infrastructure comment to MCCIA Director General Prashant Girbane.",
            "status": "Verified",
            "url": "https://www.newsexpressmarathi.com/media/2024-04/17-april-2024.pdf",
            "mediaUrl": None,
            "evidenceImageUrl": None,
            "notes": "Exact full-edition PDF evidence. Related by headline and subject to clipping record PG0400, but retained separately because the publisher and publication date differ.",
            "sourceSearchStatus": "exact-public-pdf",
            "sourceDataset": "Public News Express Marathi e-paper PDF",
            "verificationMethod": "Full public PDF, page 4 reviewed",
            "epaperKind": "Newspaper e-paper",
            "access": "Public PDF",
            "archiveUrl": "https://www.newsexpressmarathi.com/",
            "relatedRecordId": "PG0400",
        },
    ]


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--from-cache", type=Path, help="Parse a saved archive page instead of downloading it")
    args = parser.parse_args()

    source_html = args.from_cache.read_text(encoding="utf-8") if args.from_cache else fetch_text(MCCIA_ARCHIVE, args.timeout)
    archive_records = parse_sampada(source_html)
    if len(archive_records) < 40:
        raise SystemExit(f"Refusing to replace the catalogue: only {len(archive_records)} Sampada issue cards were parsed")

    records_by_id = {record["id"]: record for record in archive_records}
    for record in exact_public_evidence():
        records_by_id[record["id"]] = record
    records = sorted(records_by_id.values(), key=lambda item: (item["date"], item["id"]), reverse=True)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    portal_payload = {"generatedAt": generated_at, "portals": PORTALS}
    report = {
        "generatedAt": generated_at,
        "scope": "Publicly indexed or publisher-controlled e-paper sources relevant to MCCIA and Director General Prashant Girbane",
        "summary": {
            "epaperRecords": len(records),
            "officialSampadaIssues": sum(record["publisher"] == "MCCIA Sampada" for record in records),
            "exactFullPdfEvidence": sum(record["sourceSearchStatus"] == "exact-public-pdf" for record in records),
            "publisherPortals": len(PORTALS),
        },
        "method": [
            "Harvest every issue card from the official MCCIA Sampada index.",
            "Add only exact public newspaper PDFs whose full text and identity were reviewed.",
            "Catalogue official or publisher-labelled e-paper portals for manual archive searching.",
            "Keep subscription, login and legacy-access limitations visible.",
        ],
        "limitations": [
            "E-paper search engines and paywalled archives do not expose every historical page to public web indexing.",
            "A portal listing is a research location, not evidence that a specific MCCIA mention exists.",
            "No third-party full newspaper pages are copied into the repository; the dashboard links to the publisher or public PDF.",
            "The catalogue is a best-available public index, not a guarantee that every offline or unindexed edition has been found.",
        ],
        "archive": MCCIA_ARCHIVE,
    }

    write_json(APP_DIR / "epaper-sources.json", records)
    write_json(APP_DIR / "epaper-portals.json", portal_payload)
    write_json(ROOT / "epaper_research_report.json", report)
    print(json.dumps(report["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
