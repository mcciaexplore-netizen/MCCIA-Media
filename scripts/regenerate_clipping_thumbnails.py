import json
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'app' / 'clippings.json'
PUBLIC = ROOT / 'public'


def main():
    clippings = json.loads(MANIFEST.read_text(encoding='utf-8'))
    completed = failed = 0
    for item in clippings:
        source = Path(item['originalLocalPath'])
        target = PUBLIC / Path(item['thumbnailUrl'].lstrip('/'))
        try:
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened).convert('RGB')
                image.thumbnail((850, 1050), Image.Resampling.LANCZOS, reducing_gap=3.0)
                target.parent.mkdir(parents=True, exist_ok=True)
                image.save(target, 'WEBP', quality=45, method=4)
            completed += 1
        except Exception as exc:
            item['thumbnailStatus'] = f'Failed: {exc}'
            failed += 1
        if completed and completed % 150 == 0:
            print(json.dumps({'thumbnails_completed': completed, 'total': len(clippings)}), flush=True)
    MANIFEST.write_text(json.dumps(clippings, ensure_ascii=False, indent=2), encoding='utf-8')
    total_bytes = sum(path.stat().st_size for path in (PUBLIC / 'clippings').rglob('*.webp'))
    print(json.dumps({'thumbnails_completed': completed, 'failed': failed, 'thumbnail_bytes': total_bytes}, indent=2))


if __name__ == '__main__':
    main()
