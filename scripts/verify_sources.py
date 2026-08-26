"""Audit every dashboard record's public source without overstating verification.

The audit checks URL reachability and compares a record headline with the title
reported by the linked page.  It deliberately does not rewrite editorial
``status`` values: a reachable page or similar title is useful evidence, but it
is not a substitute for a person confirming the full article.
"""

from __future__ import annotations

import argparse
import gzip
import html
import json
import re
import socket
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECORD_PATHS = (ROOT / "app" / "records.json", ROOT / "app" / "google-news-alerts.json")
OUTPUT_PATH = ROOT / "app" / "source-verification.json"
REPORT_PATH = ROOT / "source_verification_report.json"
USER_AGENT = "MCCIA-Media-Source-Audit/1.0 (+https://github.com/mcciaexplore-netizen/MCCIA-Media)"
MAX_BODY_BYTES = 768 * 1024
WRITE_LOCK = threading.Lock()
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it",
    "of", "on", "or", "the", "to", "with", "mccia", "news", "latest", "official", "page",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit MCCIA dashboard source URLs.")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--stale-days", type=int, default=30)
    parser.add_argument("--force", action="store_true", help="Ignore recent cached checks.")
    parser.add_argument("--report-only", action="store_true", help="Rebuild summaries from cached checks without network requests.")
    return parser.parse_args()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat()


def load_records() -> list[dict]:
    records: dict[str, dict] = {}
    for path in RECORD_PATHS:
        if not path.exists():
            continue
        for record in json.loads(path.read_text(encoding="utf-8")):
            if record.get("id"):
                records[record["id"]] = record
    return list(records.values())


def previous_entries() -> dict[str, dict]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return payload.get("records", {}) if isinstance(payload, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def normalized(value: str | None) -> str:
    value = html.unescape(value or "").lower()
    value = re.sub(r"[^a-z0-9\u0900-\u097f]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def title_score(wanted: str | None, found: str | None) -> float:
    wanted_text, found_text = normalized(wanted), normalized(found)
    if not wanted_text or not found_text:
        return 0.0
    wanted_tokens = {token for token in wanted_text.split() if len(token) > 1 and token not in STOP_WORDS}
    found_tokens = {token for token in found_text.split() if len(token) > 1 and token not in STOP_WORDS}
    if not wanted_tokens or not found_tokens:
        return round(SequenceMatcher(None, wanted_text, found_text).ratio(), 3)
    overlap = len(wanted_tokens & found_tokens)
    recall = overlap / len(wanted_tokens)
    precision = overlap / len(found_tokens)
    sequence = SequenceMatcher(None, wanted_text, found_text).ratio()
    return round(max(sequence, recall, (2 * recall * precision / (recall + precision)) if overlap else 0.0), 3)


def extract_page_title(body: bytes, content_type: str, encoding: str | None) -> str:
    if not body or "html" not in content_type.lower():
        return ""
    charset = encoding or "utf-8"
    try:
        text = body.decode(charset, errors="replace")
    except LookupError:
        text = body.decode("utf-8", errors="replace")
    candidates = []
    for pattern in (
        r"<meta[^>]+(?:property|name)=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)",
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']og:title[\"']",
        r"<title[^>]*>(.*?)</title>",
    ):
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            candidates.append(re.sub(r"\s+", " ", html.unescape(match.group(1))).strip())
    return max(candidates, key=len, default="")[:500]


def is_homepage(url: str) -> bool:
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path.rstrip("/")
    return not path or path.lower() in {"/home", "/index", "/index.html", "/en", "/en-in"}


def decompress_body(body: bytes, encoding: str) -> bytes:
    encoding = encoding.lower()
    try:
        if encoding == "gzip":
            return gzip.decompress(body)
        if encoding == "deflate":
            return zlib.decompress(body)
    except (OSError, zlib.error):
        pass
    return body


def base_entry(record: dict, category: str, label: str, explanation: str) -> dict:
    return {
        "recordId": record["id"],
        "url": record.get("url"),
        "category": category,
        "displayLabel": label,
        "explanation": explanation,
        "checkedAt": iso_now(),
        "httpStatus": None,
        "finalUrl": None,
        "contentType": None,
        "pageTitle": None,
        "titleMatchScore": None,
    }


def audit_record(record: dict, timeout: float) -> dict:
    url = str(record.get("url") or "").strip()
    if not url:
        detail = "Authentic clipping evidence exists, but no public publisher URL is recorded." if record.get("evidenceImageUrl") else "No public source URL is recorded for this item."
        return base_entry(record, "no-public-url", "No public source URL", detail)
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or re.search(r"\s", url):
        return base_entry(record, "invalid-url", "Invalid source URL", "The recorded source is not a valid public HTTP(S) URL.")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
            "Accept-Encoding": "identity",
            "Accept-Language": "en-IN,en;q=0.8,hi;q=0.5,mr;q=0.5",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
            status = int(response.status or 200)
            final_url = response.geturl()
            content_type = response.headers.get_content_type() or "application/octet-stream"
            encoding = response.headers.get_content_charset()
            body = response.read(MAX_BODY_BYTES)
            body = decompress_body(body, response.headers.get("Content-Encoding", ""))
            page_title = extract_page_title(body, content_type, encoding)
    except urllib.error.HTTPError as exc:
        category = "restricted" if exc.code in {401, 403, 405, 406, 409, 429, 451, 999} else "unreachable"
        label = "Restricted — manual review" if category == "restricted" else "Unreachable source"
        entry = base_entry(record, category, label, f"The publisher returned HTTP {exc.code}; check this source manually.")
        entry["httpStatus"] = exc.code
        entry["finalUrl"] = exc.geturl()
        return entry
    except (urllib.error.URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError) as exc:
        entry = base_entry(record, "unreachable", "Unreachable source", "The automated audit could not open this URL; it requires a manual check.")
        entry["error"] = re.sub(r"\s+", " ", str(exc))[:250]
        return entry

    score = title_score(record.get("title"), page_title)
    lowered_title = normalized(page_title)
    is_restricted_page = any(marker in lowered_title for marker in ("sign in", "log in", "access denied", "captcha", "just a moment"))
    is_google_discovery = record.get("sourceDataset") == "Weekly Google News RSS" or "news.google.com" in parsed.netloc
    if is_google_discovery:
        category, label, explanation = "discovery-link", "Google News discovery", "Google News exposed this item; the publisher article still requires editorial verification."
    elif is_restricted_page:
        category, label, explanation = "restricted", "Restricted — manual review", "The URL opened an access or sign-in page instead of readable article evidence."
    elif is_homepage(final_url) or is_homepage(url):
        category, label, explanation = "homepage-only", "Homepage/reference only", "The link opens a publisher or organisation homepage, not a uniquely identified article."
    elif "pdf" in content_type.lower() or final_url.lower().split("?")[0].endswith(".pdf"):
        category, label, explanation = "reachable-pdf", "Reachable PDF — review needed", "The PDF is publicly reachable; its contents still require an editorial reading."
    elif page_title and score >= 0.72:
        category, label, explanation = "headline-confirmed", "Headline confirmed", "The public page is reachable and its page title strongly agrees with the dashboard headline."
    elif page_title and score >= 0.48:
        category, label, explanation = "possible-headline-match", "Possible headline match", "The public page is reachable and its title partly agrees; review the article before treating it as verified."
    elif page_title:
        category, label, explanation = "reachable-title-review", "Reachable — title review needed", "The public page is reachable, but its title does not sufficiently match the dashboard headline."
    else:
        category, label, explanation = "reachable-no-title", "Reachable — review needed", "The URL is reachable, but the audit could not recover a comparable page title."

    entry = base_entry(record, category, label, explanation)
    entry.update(
        {
            "httpStatus": status,
            "finalUrl": final_url,
            "contentType": content_type,
            "pageTitle": page_title or None,
            "titleMatchScore": score if page_title else None,
        }
    )
    return entry


def is_fresh(entry: dict, record: dict, stale_days: int) -> bool:
    if entry.get("url") != record.get("url"):
        return False
    try:
        checked = datetime.fromisoformat(entry.get("checkedAt", "").replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    return checked >= now_utc() - timedelta(days=stale_days)


def make_payload(entries: dict[str, dict], total: int) -> dict:
    counts: dict[str, int] = {}
    for entry in entries.values():
        category = entry.get("category", "unknown")
        counts[category] = counts.get(category, 0) + 1
    reachable_categories = {
        "headline-confirmed", "possible-headline-match", "reachable-title-review", "reachable-no-title",
        "reachable-pdf", "homepage-only", "discovery-link",
    }
    summary = {
        "totalRecords": total,
        "sourceCheckedRecords": len(entries),
        "withPublicUrl": total - counts.get("no-public-url", 0) - counts.get("invalid-url", 0),
        "withoutPublicUrl": counts.get("no-public-url", 0) + counts.get("invalid-url", 0),
        "reachablePublicUrls": sum(counts.get(category, 0) for category in reachable_categories),
        "headlineConfirmed": counts.get("headline-confirmed", 0),
        "manualReviewRequired": total - counts.get("headline-confirmed", 0),
        "categories": dict(sorted(counts.items())),
    }
    return {
        "generatedAt": iso_now(),
        "methodology": "Automated URL reachability and page-title agreement audit. This does not replace editorial review of article contents.",
        "summary": summary,
        "records": dict(sorted(entries.items())),
    }


def write_outputs(entries: dict[str, dict], total: int) -> None:
    payload = make_payload(entries, total)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "generatedAt": payload["generatedAt"],
        "methodology": payload["methodology"],
        "summary": payload["summary"],
        "recordsRequiringManualReview": [
            {
                "recordId": entry["recordId"],
                "category": entry["category"],
                "url": entry.get("url"),
                "httpStatus": entry.get("httpStatus"),
                "pageTitle": entry.get("pageTitle"),
                "titleMatchScore": entry.get("titleMatchScore"),
            }
            for entry in entries.values()
            if entry.get("category") != "headline-confirmed"
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    records = load_records()
    prior = previous_entries()
    if args.report_only:
        entries = {record["id"]: prior[record["id"]] for record in records if record["id"] in prior}
        write_outputs(entries, len(records))
        print(json.dumps(make_payload(entries, len(records))["summary"], ensure_ascii=False, indent=2))
        return 0
    entries: dict[str, dict] = {}
    queue = []
    for record in records:
        cached = prior.get(record["id"])
        if not args.force and cached and is_fresh(cached, record, args.stale_days):
            entries[record["id"]] = cached
        else:
            queue.append(record)

    if not queue and len(entries) == len(records) and OUTPUT_PATH.exists() and REPORT_PATH.exists():
        payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        print(json.dumps(payload.get("summary", {}), ensure_ascii=False, indent=2))
        return 0

    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(audit_record, record, args.timeout): record for record in queue}
        for future in as_completed(futures):
            record = futures[future]
            try:
                entries[record["id"]] = future.result()
            except Exception as exc:  # A single unusual publisher must not stop the full audit.
                entry = base_entry(record, "audit-error", "Audit error — manual review", "The automated source check failed unexpectedly.")
                entry["error"] = re.sub(r"\s+", " ", str(exc))[:250]
                entries[record["id"]] = entry
            completed += 1
            if completed % 25 == 0 or completed == len(queue):
                with WRITE_LOCK:
                    write_outputs(entries, len(records))
                print(json.dumps({"checkedThisRun": completed, "queued": len(queue), "totalClassified": len(entries)}), flush=True)

    write_outputs(entries, len(records))
    print(json.dumps(make_payload(entries, len(records))["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
