import hashlib
import io
import json
import os
import re
import shutil
import zipfile
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path(r'C:\Users\Aarushi Gupta\Downloads')
ARCHIVES = [
    DOWNLOADS / '2021-20260825T084201Z-1-001.zip',
    DOWNLOADS / '2022-20260825T083953Z-1-001.zip',
    DOWNLOADS / '2023-20260825T083934Z-1-001.zip',
    DOWNLOADS / '2024-20260825T083932Z-1-001.zip',
    DOWNLOADS / '2025-20260825T083929Z-1-001.zip',
    DOWNLOADS / '2026-20260825T083927Z-1-001.zip',
]
RECORDS_PATH = ROOT / 'app' / 'records.json'
MANIFEST_PATH = ROOT / 'app' / 'clippings.json'
REPORT_PATH = ROOT / 'clipping_ingestion_report.json'
ORIGINALS = ROOT / 'media-archive' / 'originals'
THUMBNAILS = ROOT / 'public' / 'clippings'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


def text(value):
    return str(value).strip() if value is not None else ''


def canonical_publisher(value):
    compact = re.sub(r'[^a-z]+', '', text(value).lower())
    aliases = [
        ('maharashtratimes', 'Maharashtra Times'), ('maharashtatimes', 'Maharashtra Times'),
        ('maharashratimes', 'Maharashtra Times'), ('maharashrtatimes', 'Maharashtra Times'),
        ('timesofindia', 'Times of India'), ('timesoindia', 'Times of India'),
        ('hindustantimes', 'Hindustan Times'), ('hindistantimes', 'Hindustan Times'),
        ('indianexpress', 'Indian Express'), ('indiianexpress', 'Indian Express'),
        ('indinaexpress', 'Indian Express'), ('financialexpress', 'Financial Express'),
        ('economicstimes', 'Economic Times'), ('economicstimes', 'Economic Times'),
        ('businessline', 'Business Line'), ('aajkaanand', 'Aaj Ka Anand'),
        ('loksatta', 'Loksatta'), ('lokstta', 'Loksatta'), ('losatta', 'Loksatta'),
        ('pudhari', 'Pudhari'), ('sarkarnama', 'Sarkarnama'), ('esakal', 'Sakal'),
        ('sakal', 'Sakal'), ('lokmat', 'Lokmat'), ('lokamt', 'Lokmat'),
        ('prabhat', 'Prabhat'), ('agrowon', 'Agrowon'), ('agrovan', 'Agrowon'),
        ('navarashtra', 'Navrashtra'), ('navrashtra', 'Navrashtra'),
        ('navabharat', 'Navbharat'), ('navbharat', 'Navbharat'),
        ('saamana', 'Saamana'), ('saamna', 'Saamana'), ('punetimesmirror', 'Pune Mirror'),
        ('punetimemirror', 'Pune Mirror'), ('punemirror', 'Pune Mirror'),
        ('mint', 'Mint'), ('kesari', 'Kesari'), ('jansewa', 'Jansewa News'),
        ('janseva', 'Jansewa News'), ('rashtrasanchar', 'Rashtra Sanchar'),
    ]
    for key, publisher in aliases:
        if key in compact:
            return publisher
    return re.sub(r'\s+', ' ', text(value).title()) or 'Publisher not identified'


def ascii_digits(value):
    return text(value).translate(str.maketrans('०१२३४५६७८९', '0123456789'))


def parse_date(filename, archive_year):
    value = ascii_digits(filename)
    match = re.search(r'(?<!\d)([0-3]?\d)\s*[.\-/]\s*([01]?\d)\s*[.\-/]\s*(20\d{2})(?:\d)?(?!\d)', value)
    if match:
        parsed_year = int(match.group(3))
        if len(re.search(r'(20\d{2}\d?)', match.group(0)).group(1)) == 5:
            parsed_year = archive_year
        try:
            return date(parsed_year, int(match.group(2)), int(match.group(1))).isoformat(), match.start()
        except ValueError:
            pass
    match = re.search(r'(?i)([0-3]?\d)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})', value)
    if match:
        month = datetime.strptime(match.group(2), '%B').month
        return date(int(match.group(3)), month, int(match.group(1))).isoformat(), match.start()
    return '', -1


def parse_page(value):
    normalized = ascii_digits(value)
    match = re.search(r'(?i)(?:p(?:age)?\s*[.,]?\s*no\.?|page|पान\s*नं)\s*[.:,-]*\s*([0-9]+|[ivx]+)', normalized)
    return match.group(1).lower() if match else ''


def add_evidence(record, item):
    evidence = record.setdefault('evidenceImages', [])
    if not any(existing.get('sha256') == item['sha256'] for existing in evidence):
        evidence.append({
            'sha256': item['sha256'], 'thumbnailUrl': item['thumbnailUrl'],
            'originalFilename': item['originalFilename'], 'publisher': item['publisher'],
            'date': item['date'], 'page': item['page'], 'quality': item['quality'],
        })
    record['evidenceImageUrl'] = evidence[0]['thumbnailUrl']
    record['verificationMethod'] = 'Clipping verified' if not record.get('url') else 'URL and clipping verified'
    if record.get('status') == 'Unverified':
        record['status'] = 'Clipping verified'


def main():
    records = json.loads(RECORDS_PATH.read_text(encoding='utf-8'))
    record_index = defaultdict(list)
    for record in records:
        if record.get('format') == 'Print newspaper index':
            record_index[(text(record.get('date')), canonical_publisher(record.get('publisher')))].append(record)

    ORIGINALS.mkdir(parents=True, exist_ok=True)
    THUMBNAILS.mkdir(parents=True, exist_ok=True)
    by_hash = {}
    duplicate_copies = 0

    for archive_path in ARCHIVES:
        archive_year = int(archive_path.name[:4])
        with zipfile.ZipFile(archive_path) as archive:
            members = [item for item in archive.infolist() if not item.is_dir() and Path(item.filename).suffix.lower() in IMAGE_EXTENSIONS]
            for index, member in enumerate(members, 1):
                data = archive.read(member)
                digest = hashlib.sha256(data).hexdigest()
                if digest in by_hash:
                    duplicate_copies += 1
                    by_hash[digest]['duplicateFilenames'].append(member.filename)
                    continue

                extension = Path(member.filename).suffix.lower()
                original_path = ORIGINALS / digest[:2] / f'{digest}{extension}'
                original_path.parent.mkdir(parents=True, exist_ok=True)
                if not original_path.exists():
                    original_path.write_bytes(data)

                with Image.open(io.BytesIO(data)) as opened:
                    image = ImageOps.exif_transpose(opened).convert('RGB')
                    width, height = image.size
                    quality = 'High' if min(width, height) >= 1200 else ('Medium' if min(width, height) >= 800 else 'Low')
                    thumbnail_path = THUMBNAILS / digest[:2] / f'{digest}.webp'
                    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
                    if not thumbnail_path.exists():
                        preview = image.copy()
                        preview.thumbnail((850, 1050), Image.Resampling.LANCZOS)
                        preview.save(thumbnail_path, 'WEBP', quality=45, method=4, optimize=True)

                basename = Path(member.filename).stem
                published, date_position = parse_date(basename, archive_year)
                prefix = basename[:date_position] if date_position >= 0 else basename
                publisher = canonical_publisher(prefix)
                page = parse_page(basename)
                candidates = record_index.get((published, publisher), []) if published else []
                page_candidates = [record for record in candidates if page and parse_page(record.get('description')) == page]
                matched = None
                match_status = 'Potential new record'
                if len(page_candidates) == 1:
                    matched = page_candidates[0]
                    match_status = 'Auto matched: date + publisher + page'
                elif len(candidates) == 1:
                    matched = candidates[0]
                    match_status = 'Auto matched: unique date + publisher'
                elif len(candidates) > 1:
                    match_status = 'Ambiguous: OCR review required'
                elif not published:
                    match_status = 'Manual date review required'

                item = {
                    'id': f'CLIP-{digest[:12].upper()}', 'sha256': digest,
                    'year': archive_year, 'date': published, 'publisher': publisher,
                    'page': page, 'originalFilename': member.filename,
                    'duplicateFilenames': [], 'sourceArchive': archive_path.name,
                    'originalLocalPath': str(original_path),
                    'thumbnailUrl': f'/clippings/{digest[:2]}/{digest}.webp',
                    'width': width, 'height': height, 'byteSize': len(data),
                    'quality': quality, 'matchStatus': match_status,
                    'matchedRecordId': matched.get('id') if matched else None,
                    'candidateRecordIds': [record.get('id') for record in candidates],
                    'ocrText': None, 'ocrHeadline': None, 'ocrStatus': 'Not requested',
                    'reviewDecision': None,
                }
                by_hash[digest] = item
                if matched:
                    add_evidence(matched, item)
                if index % 100 == 0:
                    print(json.dumps({'archive': archive_year, 'processed': index, 'total': len(members), 'unique_so_far': len(by_hash)}), flush=True)

    manifest = sorted(by_hash.values(), key=lambda item: (item['date'], item['publisher'], item['originalFilename']), reverse=True)
    RECORDS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    status_counts = defaultdict(int)
    quality_counts = defaultdict(int)
    for item in manifest:
        status_counts[item['matchStatus']] += 1
        quality_counts[item['quality']] += 1
    report = {
        'input_images': sum(1 for archive_path in ARCHIVES for item in zipfile.ZipFile(archive_path).infolist() if not item.is_dir() and Path(item.filename).suffix.lower() in IMAGE_EXTENSIONS),
        'unique_originals': len(manifest), 'duplicate_copies_removed': duplicate_copies,
        'match_status': dict(status_counts), 'quality': dict(quality_counts),
        'originals_bytes': sum(item['byteSize'] for item in manifest),
        'thumbnail_bytes': sum((ROOT / 'public' / item['thumbnailUrl'].lstrip('/')).stat().st_size for item in manifest),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
