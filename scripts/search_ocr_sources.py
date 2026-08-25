import argparse
import base64
import html
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIPPINGS_PATH = ROOT / 'app' / 'clippings.json'
RECORDS_PATH = ROOT / 'app' / 'records.json'
CHECKPOINT_PATH = ROOT / 'ocr_source_search_checkpoint.json'
REPORT_PATH = ROOT / 'ocr_source_search_report.json'
LOCK = threading.Lock()

PUBLISHER_DOMAINS = {
    'Times of India': ('timesofindia.indiatimes.com',),
    'Indian Express': ('indianexpress.com',),
    'Financial Express': ('financialexpress.com',),
    'Economic Times': ('economictimes.indiatimes.com',),
    'Hindustan Times': ('hindustantimes.com',),
    'Business Line': ('thehindubusinessline.com',),
    'Loksatta': ('loksatta.com',),
    'Lokmat': ('lokmat.com',),
    'Sakal': ('esakal.com', 'sarkarnama.esakal.com'),
    'Pudhari': ('pudhari.news',),
    'Maharashtra Times': ('maharashtratimes.com',),
    'Mint': ('livemint.com',),
}


def text(value):
    return str(value).strip() if value is not None else ''


def norm(value):
    value = html.unescape(text(value)).lower()
    value = re.sub(r'[^a-z0-9\u0900-\u097f]+', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def strip_tags(value):
    return re.sub(r'<[^>]+>', ' ', html.unescape(value))


def decode_bing_url(url):
    parsed = urllib.parse.urlparse(html.unescape(url))
    if parsed.netloc.endswith('bing.com') and parsed.path.startswith('/ck/a'):
        encoded = urllib.parse.parse_qs(parsed.query).get('u', [''])[0]
        if encoded.startswith('a1'):
            encoded = encoded[2:]
            try:
                padding = '=' * (-len(encoded) % 4)
                return base64.urlsafe_b64decode(encoded + padding).decode('utf-8', errors='replace')
            except (ValueError, UnicodeDecodeError):
                return url
    return url


def parse_results(raw):
    results = []
    for block in re.findall(r'<li[^>]+class="[^"]*b_algo[^"]*".*?</li>', raw, re.DOTALL | re.IGNORECASE):
        match = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.DOTALL | re.IGNORECASE)
        if not match:
            continue
        url = decode_bing_url(match.group(1))
        if not url.startswith(('http://', 'https://')) or 'bing.com/' in urllib.parse.urlparse(url).netloc:
            continue
        title = re.sub(r'\s+', ' ', strip_tags(match.group(2))).strip()
        snippet_match = re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL | re.IGNORECASE)
        snippet = re.sub(r'\s+', ' ', strip_tags(snippet_match.group(1))).strip() if snippet_match else ''
        results.append({'title': title, 'url': url, 'snippet': snippet})
    return results


def score(item, candidate):
    wanted = norm(item.get('ocrHeadline'))
    found = norm(candidate.get('title'))
    if not wanted or not found:
        return 0.0
    similarity = SequenceMatcher(None, wanted, found).ratio()
    wanted_tokens = [token for token in wanted.split() if len(token) > 2]
    coverage = sum(token in found for token in wanted_tokens) / max(1, len(wanted_tokens))
    score_value = max(similarity, coverage * 0.96)
    domain = urllib.parse.urlparse(candidate.get('url', '')).netloc.lower().removeprefix('www.')
    expected_domains = PUBLISHER_DOMAINS.get(item.get('publisher'), ())
    if expected_domains and any(domain == expected or domain.endswith('.' + expected) for expected in expected_domains):
        score_value += 0.08
    publisher = norm(item.get('publisher')).replace(' ', '')
    if publisher and publisher in norm(candidate.get('title') + ' ' + domain).replace(' ', ''):
        score_value += 0.03
    return round(min(1.0, score_value), 3)


def search_one(item):
    headline = text(item.get('ocrHeadline'))
    query = f'"{headline}" {text(item.get("publisher"))} {text(item.get("date"))}'
    if len(headline) < 16:
        query += ' MCCIA Prashant Girbane'
    url = 'https://www.bing.com/search?' + urllib.parse.urlencode({'q': query, 'count': 8, 'setlang': 'en-IN'})
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept-Language': 'en-IN,en;q=0.8,hi;q=0.6,mr;q=0.5',
    })
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read().decode('utf-8', errors='replace')
    except Exception as exc:
        return {'id': item['id'], 'outcome': 'search-error', 'error': str(exc)[:300], 'candidates': []}
    candidates = parse_results(raw)
    for candidate in candidates:
        candidate['matchScore'] = score(item, candidate)
    candidates.sort(key=lambda candidate: candidate['matchScore'], reverse=True)
    best = candidates[0] if candidates else None
    if best and best['matchScore'] >= 0.91:
        outcome = 'confident-public-url'
    elif best and best['matchScore'] >= 0.77:
        outcome = 'candidate-public-url'
    else:
        outcome = 'no-confident-public-url'
    return {'id': item['id'], 'outcome': outcome, 'best': best, 'candidates': candidates[:3], 'query': query}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--retry-errors', action='store_true')
    args = parser.parse_args()
    clippings = json.loads(CLIPPINGS_PATH.read_text(encoding='utf-8'))
    records = json.loads(RECORDS_PATH.read_text(encoding='utf-8'))
    by_record_id = {record['id']: record for record in records}
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding='utf-8')) if CHECKPOINT_PATH.exists() else {}

    eligible = []
    for item in clippings:
        if item.get('ocrStatus') != 'Completed' or len(text(item.get('ocrHeadline'))) < 8:
            continue
        record = by_record_id.get(item.get('matchedRecordId'))
        if item.get('publicSourceUrl') or (record and record.get('url')):
            continue
        prior = checkpoint.get(item['id'])
        if prior and not (args.retry_errors and prior.get('outcome') == 'search-error'):
            continue
        eligible.append(item)
    if args.limit:
        eligible = eligible[:args.limit]

    print(json.dumps({'search_pending': len(eligible), 'checkpoint_total': len(checkpoint)}, ensure_ascii=False), flush=True)
    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(search_one, item): item for item in eligible}
        for future in as_completed(futures):
            result = future.result()
            checkpoint[result['id']] = result
            completed += 1
            if completed % 10 == 0 or completed == len(eligible):
                with LOCK:
                    write_json(CHECKPOINT_PATH, checkpoint)
                print(json.dumps({'searched_this_run': completed, 'queued': len(eligible)}, ensure_ascii=False), flush=True)
            time.sleep(0.08)

    accepted = candidates_only = searched = errors = 0
    for item in clippings:
        result = checkpoint.get(item['id'])
        if not result:
            continue
        searched += 1
        item['sourceSearchStatus'] = result.get('outcome')
        item['sourceSearchQuery'] = result.get('query')
        item['sourceCandidates'] = result.get('candidates', [])
        best = result.get('best')
        if result.get('outcome') == 'confident-public-url' and best:
            item['publicSourceUrl'] = best['url']
            item['publicSourceTitle'] = best['title']
            accepted += 1
            record = by_record_id.get(item.get('matchedRecordId'))
            if record and not record.get('url'):
                record['url'] = best['url']
                record['sourceSearchStatus'] = 'confident-public-url-from-OCR'
                record['sourceCandidates'] = result.get('candidates', [])
                record['verificationMethod'] = 'Clipping verified + public source URL'
                record['notes'] = (text(record.get('notes')) + f' Public source URL recovered from OCR headline search (score {best["matchScore"]:.3f}); destination should receive editorial verification.').strip()
        elif result.get('outcome') == 'candidate-public-url':
            candidates_only += 1
        elif result.get('outcome') == 'search-error':
            errors += 1

    write_json(CLIPPINGS_PATH, clippings)
    write_json(RECORDS_PATH, records)
    report = {
        'ocr_headlines_eligible': sum(item.get('ocrStatus') == 'Completed' and len(text(item.get('ocrHeadline'))) >= 8 for item in clippings),
        'searched': searched,
        'confident_public_urls_added': accepted,
        'candidate_only': candidates_only,
        'no_confident_result': searched - accepted - candidates_only - errors,
        'search_errors': errors,
        'search_backend': 'Bing public web search (Exa unavailable: HTTP 429 rate limit)',
    }
    write_json(REPORT_PATH, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
