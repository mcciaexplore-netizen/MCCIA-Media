import json
import re
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / 'app' / 'records.json'
MANIFEST_PATH = ROOT / 'app' / 'clippings.json'
REPORT_PATH = ROOT / 'clipping_ingestion_report.json'
TESSERACT = ROOT / 'artifact-work' / 'tesseract-portable' / 'tesseract.exe'
LOCK = threading.Lock()
OCR_REQUIRED = {
    'Ambiguous: OCR review required',
    'Potential new record',
    'Manual date review required',
}


def text(value):
    return str(value).strip() if value is not None else ''


def norm(value):
    return re.sub(r'[^a-z0-9\u0900-\u097f]+', ' ', text(value).lower()).strip()


def parse_tsv(raw):
    lines = {}
    confidences = []
    rows = raw.splitlines()
    for row in rows[1:]:
        parts = row.split('\t')
        if len(parts) < 12:
            continue
        word = parts[11].strip()
        if not word:
            continue
        key = tuple(parts[index] for index in (1, 2, 3, 4))
        lines.setdefault(key, []).append(word)
        try:
            confidence = float(parts[10])
            if confidence >= 0:
                confidences.append(confidence)
        except ValueError:
            pass
    text_lines = [' '.join(words) for words in lines.values()]
    average = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
    return '\n'.join(text_lines), average


def headline(ocr_text):
    rejected = ('page no', 'p.no', 'p.no.', 'पान नं', 'times of india', 'maharashtra times')
    candidates = []
    for index, line in enumerate(ocr_text.splitlines()[:35]):
        clean = re.sub(r'\s+', ' ', line).strip(' |:-_')
        letters = re.findall(r'[A-Za-z\u0900-\u097f]', clean)
        if len(clean) < 8 or len(clean) > 180 or len(letters) < 6:
            continue
        lower = clean.lower()
        if any(marker in lower for marker in rejected) and len(clean) < 45:
            continue
        length_score = 1.0 if 18 <= len(clean) <= 100 else 0.65
        position_score = max(0, 1 - index / 40)
        candidates.append((length_score + position_score, clean))
    return max(candidates, default=(0, ''), key=lambda item: item[0])[1]


def ocr_item(item):
    command = [
        str(TESSERACT), item['originalLocalPath'], 'stdout',
        '-l', 'mar+hin+eng', '--psm', '6', 'tsv',
    ]
    try:
        run = subprocess.run(command, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        return item['sha256'], '', 0.0, 'Timed out'
    raw = run.stdout.decode('utf-8', errors='replace')
    ocr_text, confidence = parse_tsv(raw)
    status = 'Completed' if ocr_text else f'Failed ({run.returncode})'
    return item['sha256'], ocr_text, confidence, status


def title_score(title, ocr_text, ocr_headline):
    wanted = norm(title)
    if not wanted:
        return 0.0
    full = norm(ocr_text)
    head = norm(ocr_headline)
    wanted_tokens = [token for token in wanted.split() if len(token) > 2]
    coverage = sum(token in full for token in wanted_tokens) / max(1, len(wanted_tokens))
    sequence = SequenceMatcher(None, wanted, head).ratio() if head else 0
    if wanted in full:
        coverage = 1.0
    return round(max(coverage, sequence), 3)


def evidence_payload(item):
    return {
        'sha256': item['sha256'], 'thumbnailUrl': item['thumbnailUrl'],
        'originalFilename': item['originalFilename'], 'publisher': item['publisher'],
        'date': item['date'], 'page': item['page'], 'quality': item['quality'],
        'ocrConfidence': item.get('ocrConfidence'),
    }


def attach(record, item):
    evidence = record.setdefault('evidenceImages', [])
    if not any(existing.get('sha256') == item['sha256'] for existing in evidence):
        evidence.append(evidence_payload(item))
    record['evidenceImageUrl'] = evidence[0]['thumbnailUrl']
    record['verificationMethod'] = 'URL and clipping verified' if record.get('url') else 'Clipping verified'
    if record.get('status') == 'Unverified':
        record['status'] = 'Clipping verified'


def language_for(item, ocr_text):
    if item['publisher'] in {'Times of India', 'Hindustan Times', 'Indian Express', 'Financial Express', 'Economic Times', 'Business Line', 'Mint', 'Pune Mirror'}:
        return 'English'
    if item['publisher'] == 'Aaj Ka Anand':
        return 'Hindi'
    return 'Marathi' if re.search(r'[\u0900-\u097f]', ocr_text) else 'Unknown'


def presence_for(ocr_text):
    value = norm(ocr_text)
    if any(token in value for token in ('prashant girbane', 'prashant girbane', 'प्रशांत गिरबने', 'प्रशांत गिरबाणे')):
        return 'Prashant Girbane named or pictured in clipping'
    if any(token in value for token in ('mccia', 'एमसीसीआयए', 'एमसीसीआईए', 'मराठा चेंबर', 'mahratta chamber')):
        return 'MCCIA named in clipping'
    return 'MCCIA archive clipping; named person requires editorial review'


def main():
    records = json.loads(RECORDS_PATH.read_text(encoding='utf-8'))
    clippings = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    pending = [item for item in clippings if item['matchStatus'] in OCR_REQUIRED and item.get('ocrStatus') != 'Completed']
    print(json.dumps({'ocr_pending': len(pending)}), flush=True)
    completed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(ocr_item, item): item for item in pending}
        for future in as_completed(futures):
            item = futures[future]
            sha256, ocr_text, confidence, status = future.result()
            item['ocrText'] = ocr_text
            item['ocrConfidence'] = confidence
            item['ocrHeadline'] = headline(ocr_text)
            item['ocrStatus'] = status
            completed += 1
            if completed % 10 == 0 or completed == len(pending):
                with LOCK:
                    MANIFEST_PATH.write_text(json.dumps(clippings, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'ocr_completed_this_run': completed, 'ocr_total': len(pending)}), flush=True)

    by_id = {record['id']: record for record in records}
    records_by_date = {}
    for record in records:
        records_by_date.setdefault(text(record.get('date')), []).append(record)
    existing_evidence = {record.get('evidencePrimarySha256') for record in records if record.get('evidencePrimarySha256')}
    next_number = max((int(re.sub(r'\D', '', record['id']) or 0) for record in records), default=0) + 1
    resolved_ambiguous = unresolved_ambiguous = added_new = matched_other_publisher = manual_review = 0

    for item in clippings:
        if item['matchStatus'] not in OCR_REQUIRED:
            continue
        ocr_text = text(item.get('ocrText'))
        ocr_headline = text(item.get('ocrHeadline'))
        candidate_records = [by_id[record_id] for record_id in item.get('candidateRecordIds', []) if record_id in by_id]
        scored = sorted(((title_score(record.get('title'), ocr_text, ocr_headline), record) for record in candidate_records), reverse=True, key=lambda pair: pair[0])
        best_score = scored[0][0] if scored else 0
        margin = best_score - (scored[1][0] if len(scored) > 1 else 0)
        if item['matchStatus'] == 'Ambiguous: OCR review required':
            if scored and (best_score >= 0.65 or (best_score >= 0.48 and margin >= 0.12)):
                record = scored[0][1]
                attach(record, item)
                item['matchedRecordId'] = record['id']
                item['matchStatus'] = 'Matched by OCR headline'
                item['reviewDecision'] = f'Attached to {record["id"]} with title score {best_score:.3f}'
                resolved_ambiguous += 1
            else:
                item['reviewDecision'] = f'Ambiguous after OCR; best title score {best_score:.3f}'
                unresolved_ambiguous += 1
            continue

        same_date = records_by_date.get(item.get('date'), []) if item.get('date') else []
        date_scored = sorted(((title_score(record.get('title'), ocr_text, ocr_headline), record) for record in same_date), reverse=True, key=lambda pair: pair[0])
        if date_scored and date_scored[0][0] >= 0.78:
            record = date_scored[0][1]
            attach(record, item)
            item['matchedRecordId'] = record['id']
            item['matchStatus'] = 'Matched by OCR across publisher aliases'
            item['reviewDecision'] = f'Attached to {record["id"]} with same-date title score {date_scored[0][0]:.3f}'
            matched_other_publisher += 1
            continue

        if item['sha256'] in existing_evidence:
            continue
        if not ocr_text:
            item['reviewDecision'] = 'OCR failed; manual editorial review required'
            manual_review += 1
            continue
        new_record = {
            'id': f'PG{next_number:04d}', 'date': item.get('date') or '', 'year': item['year'],
            'type': 'Image', 'format': 'Newspaper clipping image',
            'publisher': item['publisher'], 'title': ocr_headline or Path(item['originalFilename']).stem,
            'language': language_for(item, ocr_text), 'presence': presence_for(ocr_text),
            'topic': 'MCCIA newspaper clipping archive',
            'description': re.sub(r'\s+', ' ', ocr_text)[:1200],
            'status': 'Clipping verified', 'url': None, 'mediaUrl': item['thumbnailUrl'],
            'evidenceImageUrl': item['thumbnailUrl'],
            'notes': f'Authentic supplied newspaper clipping. OCR confidence {item.get("ocrConfidence", 0):.1f}; editorial text review recommended.',
            'sourceDataset': 'Supplied newspaper clipping archives 2021-2026',
            'duplicateCount': 1, 'mergeNotes': 'New image-backed record created after OCR review',
            'verificationMethod': 'Clipping verified', 'evidencePrimarySha256': item['sha256'],
            'evidenceImages': [evidence_payload(item)],
        }
        records.append(new_record)
        by_id[new_record['id']] = new_record
        records_by_date.setdefault(new_record['date'], []).append(new_record)
        existing_evidence.add(item['sha256'])
        item['matchedRecordId'] = new_record['id']
        item['matchStatus'] = 'New record created after OCR review'
        item['reviewDecision'] = f'Created {new_record["id"]} from previously unmatched clipping'
        next_number += 1
        added_new += 1

    RECORDS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    MANIFEST_PATH.write_text(json.dumps(clippings, ensure_ascii=False, indent=2), encoding='utf-8')
    report = json.loads(REPORT_PATH.read_text(encoding='utf-8'))
    report['ocr_review'] = {
        'ocr_completed': sum(item.get('ocrStatus') == 'Completed' for item in clippings),
        'ambiguous_resolved': resolved_ambiguous,
        'ambiguous_unresolved': unresolved_ambiguous,
        'matched_across_publisher_aliases': matched_other_publisher,
        'new_records_created': added_new,
        'manual_review_required': manual_review,
        'final_records': len(records),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report['ocr_review'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
