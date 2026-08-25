import argparse
import json
import re
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'app' / 'records.json'
CHECKPOINT = ROOT / 'source_enrichment_checkpoint.json'
REPORT = ROOT / 'source_enrichment_report.json'
COMPARE = ROOT / 'comparison_report.json'
LOCK = threading.Lock()


def text(value):
    return str(value).strip() if value is not None else ''


def norm(value):
    value = text(value).lower()
    value = re.sub(r'[^a-z0-9\u0900-\u097f]+', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def parse_results(raw):
    try:
        payload = json.loads(raw)
        blocks = payload.get('content', [])
        body = '\n'.join(x.get('text', '') for x in blocks if x.get('type') == 'text')
    except (json.JSONDecodeError, AttributeError):
        body = raw
    results = []
    for block in re.split(r'\n---\n', body):
        title = re.search(r'^Title:\s*(.+)$', block, re.MULTILINE)
        url = re.search(r'^URL:\s*(\S+)$', block, re.MULTILINE)
        published = re.search(r'^Published:\s*(.+)$', block, re.MULTILINE)
        if title and url:
            results.append({
                'title': title.group(1).strip(),
                'url': url.group(1).strip(),
                'published': published.group(1).strip() if published else '',
            })
    return results


def score(record, candidate):
    wanted, found = norm(record.get('title')), norm(candidate.get('title'))
    if not wanted or not found:
        return 0.0
    similarity = SequenceMatcher(None, wanted, found).ratio()
    if wanted in found or found in wanted:
        similarity = max(similarity, min(len(wanted), len(found)) / max(len(wanted), len(found)))
    publisher = norm(record.get('publisher')).replace(' ', '')
    haystack = norm(candidate.get('title') + ' ' + candidate.get('url')).replace(' ', '')
    publisher_bonus = 0.04 if publisher and publisher in haystack else 0
    return min(1.0, similarity + publisher_bonus)


def search(record):
    query = f'"{text(record.get("title"))}" "{text(record.get("publisher"))}" {text(record.get("date"))} MCCIA'
    call = f'exa.web_search_exa(query: {json.dumps(query, ensure_ascii=False)}, numResults: 5)'
    command = [
        str(Path.home() / 'AppData' / 'Roaming' / 'npm' / 'mcporter.cmd'),
        'call', call, '--output', 'json', '--timeout', '30000',
    ]
    try:
        run = subprocess.run(command, capture_output=True, text=True, timeout=40, encoding='utf-8', errors='replace')
    except subprocess.TimeoutExpired:
        return {'id': record['id'], 'outcome': 'search-timeout', 'candidates': []}
    if run.returncode:
        return {'id': record['id'], 'outcome': 'search-error', 'error': run.stderr[-500:], 'candidates': []}
    candidates = parse_results(run.stdout)
    for item in candidates:
        item['matchScore'] = round(score(record, item), 3)
    candidates.sort(key=lambda item: item['matchScore'], reverse=True)
    best = candidates[0] if candidates else None
    outcome = 'exact-link' if best and best['matchScore'] >= 0.92 else ('likely-link' if best and best['matchScore'] >= 0.84 else 'no-confident-link')
    return {'id': record['id'], 'outcome': outcome, 'best': best, 'candidates': candidates[:3]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--finalize-only', action='store_true')
    args = parser.parse_args()
    records = json.loads(TARGET.read_text(encoding='utf-8'))
    checkpoint = json.loads(CHECKPOINT.read_text(encoding='utf-8')) if CHECKPOINT.exists() else {}
    queue = [
        r for r in records
        if not r.get('url') and r.get('format') == 'Print newspaper index'
        and (r['id'] not in checkpoint or checkpoint[r['id']].get('outcome') in ('search-error', 'search-timeout'))
    ]
    if args.finalize_only:
        queue = []
    if args.limit:
        queue = queue[:args.limit]
    completed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(search, r): r for r in queue}
        for future in as_completed(futures):
            result = future.result()
            checkpoint[result['id']] = result
            completed += 1
            if completed % 10 == 0 or completed == len(queue):
                with LOCK:
                    CHECKPOINT.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'completed_this_run': completed, 'queued': len(queue), 'checkpoint_total': len(checkpoint)}, ensure_ascii=False), flush=True)

    by_id = {r['id']: r for r in records}
    accepted = likely = candidates_only = 0
    for record_id, result in checkpoint.items():
        record = by_id.get(record_id)
        if not record:
            continue
        best = result.get('best')
        record['sourceSearchStatus'] = result.get('outcome')
        record['sourceCandidates'] = result.get('candidates', [])
        if result.get('outcome') in ('exact-link', 'likely-link') and best:
            record['url'] = best['url']
            accepted += 1
            likely += result.get('outcome') == 'likely-link'
            record['status'] = 'Partially verified'
            record['notes'] = text(record.get('notes')) + f' Public search match attached ({result["outcome"]}, score {best["matchScore"]}); page content still requires human verification.'
        elif result.get('candidates'):
            candidates_only += 1
    TARGET.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    search_errors = sum(v.get('outcome') in ('search-error', 'search-timeout') for v in checkpoint.values())
    report = {
        'eligible_linkless_print_records': sum(not r.get('url') and r.get('format') == 'Print newspaper index' for r in records),
        'attempted': len(checkpoint),
        'searched_successfully': len(checkpoint) - search_errors,
        'accepted_links': accepted,
        'likely_links': likely,
        'candidate_only_records': candidates_only,
        'retry_required': search_errors + sum(r.get('format') == 'Print newspaper index' and not r.get('url') and r['id'] not in checkpoint for r in records),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    comparison = json.loads(COMPARE.read_text(encoding='utf-8'))
    comparison['source_enrichment'] = report | {
        'search_errors_or_rate_limits': search_errors,
        'direct_source_images': sum(bool(r.get('mediaUrl')) for r in records),
    }
    comparison['with_url'] = sum(bool(r.get('url')) for r in records)
    comparison['without_url'] = sum(not r.get('url') for r in records)
    comparison['verified'] = sum(r.get('status') == 'Verified' for r in records)
    comparison['partial'] = sum(r.get('status') == 'Partially verified' for r in records)
    comparison['unverified'] = sum(r.get('status') == 'Unverified' for r in records)
    COMPARE.write_text(json.dumps(comparison, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
