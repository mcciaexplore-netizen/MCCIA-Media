import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIPPINGS_PATH = ROOT / 'app' / 'clippings.json'
RECORDS_PATH = ROOT / 'app' / 'records.json'
INGESTION_REPORT_PATH = ROOT / 'clipping_ingestion_report.json'
SOURCE_REPORT_PATH = ROOT / 'ocr_source_search_report.json'
COMPARISON_PATH = ROOT / 'comparison_report.json'
PRIVATE_MANIFEST_PATH = ROOT / 'media-archive' / 'evidence_manifest_private.json'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    # The private manifest is authoritative because it preserves full OCR text,
    # local evidence paths, and legacy readings.  Public JSON is a redacted view.
    source_path = PRIVATE_MANIFEST_PATH if PRIVATE_MANIFEST_PATH.exists() else CLIPPINGS_PATH
    clippings = json.loads(source_path.read_text(encoding='utf-8'))
    records = json.loads(RECORDS_PATH.read_text(encoding='utf-8'))
    ingestion = json.loads(INGESTION_REPORT_PATH.read_text(encoding='utf-8'))
    source_report = json.loads(SOURCE_REPORT_PATH.read_text(encoding='utf-8')) if SOURCE_REPORT_PATH.exists() else {}
    comparison = json.loads(COMPARISON_PATH.read_text(encoding='utf-8'))

    if not PRIVATE_MANIFEST_PATH.exists():
        write_json(PRIVATE_MANIFEST_PATH, clippings)
    public_clippings = []
    for item in clippings:
        public = {
            key: value
            for key, value in item.items()
            if key not in {'originalLocalPath', 'ocrText', 'byteSize', 'legacyOcr'}
        }
        ocr_text = ' '.join(str(item.get('ocrText') or '').split())
        public['ocrExcerpt'] = ocr_text[:700] or None
        public_clippings.append(public)

    match_counts = Counter(item.get('matchStatus') for item in public_clippings)
    ocr_counts = Counter(item.get('ocrStatus') for item in public_clippings)
    engine_counts = Counter(
        item.get('ocrEngine') or ('Tesseract 5' if item.get('ocrStatus') == 'Completed' else 'Not read')
        for item in public_clippings
    )
    thumbnail_bytes = sum((ROOT / 'public' / Path(item['thumbnailUrl'].lstrip('/'))).stat().st_size for item in public_clippings)
    connected = sum(bool(item.get('matchedRecordId')) for item in public_clippings)
    ambiguous = sum(count for label, count in match_counts.items() if str(label).startswith('Ambiguous'))
    auto_connected = sum(count for label, count in match_counts.items() if str(label).startswith('Auto matched'))
    ocr_connected = sum(count for label, count in match_counts.items() if str(label).startswith('Matched by OCR'))
    new_records = match_counts['New record created after OCR review']

    ingestion['final_archive'] = {
        'unique_originals_preserved': len(public_clippings),
        'duplicate_copies_removed': ingestion.get('duplicate_copies_removed', 0),
        'auto_connected': auto_connected,
        'ocr_connected': ocr_connected,
        'new_records_created': new_records,
        'connected_evidence_total': connected,
        'ambiguous_after_ocr': ambiguous,
        'ocr_completed': ocr_counts['Completed'],
        'ocr_timed_out': ocr_counts['Timed out'],
        'ai_ocr_upgraded': engine_counts['PaddleOCR'],
        'ocr_engines': dict(engine_counts),
        'potential_new_items_reviewed': new_records + match_counts['Matched by OCR across publisher aliases'],
        'thumbnail_bytes': thumbnail_bytes,
        'public_url_search': source_report,
    }
    comparison['final_records'] = len(records)
    comparison['with_url'] = sum(bool(record.get('url')) for record in records)
    comparison['without_url'] = sum(not record.get('url') for record in records)
    comparison['verified'] = sum(record.get('status') == 'Verified' for record in records)
    comparison['partial'] = sum(record.get('status') == 'Partially verified' for record in records)
    comparison['clipping_verified'] = sum(record.get('status') == 'Clipping verified' for record in records)
    comparison['unverified'] = sum(record.get('status') == 'Unverified' for record in records)
    comparison['clipping_archive'] = ingestion['final_archive']
    comparison.setdefault('source_enrichment', {})['direct_source_images'] = sum(bool(record.get('mediaUrl')) for record in records)
    comparison['source_enrichment']['records_with_clipping_evidence'] = sum(bool(record.get('evidenceImageUrl')) for record in records)

    write_json(CLIPPINGS_PATH, public_clippings)
    write_json(INGESTION_REPORT_PATH, ingestion)
    write_json(COMPARISON_PATH, comparison)
    print(json.dumps(ingestion['final_archive'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
