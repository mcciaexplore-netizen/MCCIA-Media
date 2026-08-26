"""Collect weekly MCCIA discoveries from public Google News RSS feeds.

This is a discovery feed, not a verification system.  Every created dashboard
record remains Unverified until an editor checks the publisher article.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "app" / "google-news-alerts.json"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
WATCHES = (
    {
        "id": "mccia",
        "label": "MCCIA",
        "query": 'MCCIA OR "Mahratta Chamber of Commerce" OR "Maratha Chamber of Commerce"',
    },
    {
        "id": "director-general",
        "label": "Director General / Prashant Girbane",
        "query": '"Prashant Girbane" OR "Prashant Girbane MCCIA" OR "प्रशांत गिरबने" OR "प्रशांत गिरबाणे"',
    },
    {
        "id": "president",
        "label": "MCCIA President",
        "query": '(MCCIA OR "Mahratta Chamber") (president OR अध्यक्ष)',
    },
    {
        "id": "leadership",
        "label": "MCCIA leadership",
        "query": '(MCCIA OR "Mahratta Chamber") ("Director General" OR director OR president OR leadership)',
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch MCCIA Google News RSS discoveries.")
    parser.add_argument("--days", type=int, default=10, help="Look-back window; default 10 days.")
    parser.add_argument("--max-per-query", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def clean_text(value: str | None) -> str:
    without_markup = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(without_markup)).strip()


def normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9\u0900-\u097f]+", " ", value.lower()).strip()


def published_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def presence_for(title: str, watch_id: str) -> str:
    value = normalized(title)
    if watch_id == "director-general" or any(
        marker in value
        for marker in ("prashant girbane", "प्रशांत गिरबने", "प्रशांत गिरबाणे", "director general")
    ):
        return "Director General / Prashant Girbane mention"
    if watch_id == "president" or any(marker in value for marker in ("president", "अध्यक्ष")):
        return "MCCIA President mention"
    return "MCCIA mention"


def feed_url(query: str, days: int) -> str:
    params = {
        "q": f"{query} when:{days}d",
        "hl": "en-IN",
        "gl": "IN",
        "ceid": "IN:en",
    }
    return f"{GOOGLE_NEWS_RSS}?{urllib.parse.urlencode(params)}"


def fetch_watch(watch: dict, days: int, limit: int) -> list[dict]:
    request = urllib.request.Request(
        feed_url(watch["query"], days),
        headers={"User-Agent": "MCCIA-Media-Monitor/1.0 (+https://github.com/mcciaexplore-netizen/MCCIA-Media)"},
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        root = ET.fromstring(response.read())
    cutoff = datetime.now(timezone.utc) - timedelta(days=days + 2)
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    records = []
    for item in root.findall("./channel/item")[:limit]:
        date = published_date(clean_text(item.findtext("pubDate")))
        if date and date < cutoff:
            continue
        source = item.find("source")
        publisher = clean_text(source.text if source is not None else "") or "Publisher not recorded"
        publisher_url = source.attrib.get("url") if source is not None else None
        raw_title = clean_text(item.findtext("title"))
        suffix = f" - {publisher}"
        title = raw_title[: -len(suffix)].strip() if raw_title.endswith(suffix) else raw_title
        link = clean_text(item.findtext("link"))
        if not title or not link:
            continue
        date_value = (date or datetime.now(timezone.utc)).date().isoformat()
        stable = normalized(f"{title}|{publisher}|{date_value}")
        record_id = f"GN-{hashlib.sha256(stable.encode('utf-8')).hexdigest()[:14].upper()}"
        records.append(
            {
                "id": record_id,
                "date": date_value,
                "year": int(date_value[:4]),
                "type": "Article",
                "format": "Google News RSS alert",
                "publisher": publisher,
                "title": title,
                "language": "Unknown",
                "presence": presence_for(title, watch["id"]),
                "topic": "Weekly Google News alert",
                "description": (
                    f"Automatically discovered by the {watch['label']} Google News RSS watch. "
                    "Open the source and complete editorial verification before relying on this item."
                ),
                "status": "Unverified",
                "url": link,
                "mediaUrl": None,
                "evidenceImageUrl": None,
                "notes": "Automated discovery only; Google News coverage is not exhaustive.",
                "sourceDataset": "Weekly Google News RSS",
                "sourceSearchStatus": "google-news-rss",
                "verificationMethod": "Automated discovery; editorial verification required",
                "googleNewsWatch": watch["label"],
                "googleNewsQuery": watch["query"],
                "googleNewsFetchedAt": fetched_at,
                "publisherUrl": publisher_url,
            }
        )
    return records


def main() -> int:
    args = parse_args()
    existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) if OUTPUT_PATH.exists() else []
    by_id = {record["id"]: record for record in existing if record.get("id")}
    errors = []
    discovered = 0
    for watch in WATCHES:
        try:
            records = fetch_watch(watch, args.days, args.max_per_query)
            for record in records:
                if record["id"] not in by_id:
                    by_id[record["id"]] = record
                    discovered += 1
        except Exception as exc:  # Keep other watches useful when one endpoint fails.
            errors.append({"watch": watch["label"], "error": str(exc)[:300]})

    if len(errors) == len(WATCHES):
        print(json.dumps({"error": "All Google News RSS watches failed", "details": errors}, indent=2))
        return 1
    merged = sorted(by_id.values(), key=lambda record: (record.get("date", ""), record.get("title", "")), reverse=True)
    if not args.dry_run:
        OUTPUT_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "existing": len(existing),
                "new": discovered,
                "total": len(merged),
                "errors": errors,
                "output": str(OUTPUT_PATH),
                "dryRun": args.dry_run,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
