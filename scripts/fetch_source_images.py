import json, re, ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'app' / 'records.json'
REPORT = ROOT / 'comparison_report.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
CTX = ssl.create_default_context()

def youtube_thumb(url):
    p=urlsplit(url)
    video=''
    if p.netloc.lower().endswith('youtu.be'): video=p.path.strip('/').split('/')[0]
    elif 'youtube.com' in p.netloc.lower():
        if p.path == '/watch': video=parse_qs(p.query).get('v',[''])[0]
        elif '/shorts/' in p.path or '/embed/' in p.path: video=p.path.rstrip('/').split('/')[-1]
    return f'https://i.ytimg.com/vi/{video}/hqdefault.jpg' if video else ''

def extract_image(base, html):
    patterns=[
      r'<meta[^>]+(?:property|name)=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)',
      r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image(?::secure_url)?["\']',
      r'<meta[^>]+(?:property|name)=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)',
      r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']twitter:image(?::src)?["\']',
      r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)',
    ]
    for pattern in patterns:
        m=re.search(pattern,html,re.I)
        if m:
            value=unescape(m.group(1)).strip()
            if value and not value.startswith('data:'):
                return urljoin(base,value)
    return ''

def fetch(record):
    url=record.get('url') or ''
    if not url: return record['id'], '', 'no-url'
    yt=youtube_thumb(url)
    if yt: return record['id'], yt, 'youtube'
    low=urlsplit(url).path.lower()
    if low.endswith(('.jpg','.jpeg','.png','.webp','.gif')): return record['id'],url,'direct-image'
    if low.endswith('.pdf'): return record['id'],'','pdf'
    try:
        req=Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml'})
        with urlopen(req,timeout=8,context=CTX) as response:
            ctype=response.headers.get('Content-Type','').lower()
            if ctype.startswith('image/'): return record['id'],response.geturl(),'direct-image'
            if 'html' not in ctype and 'text/' not in ctype: return record['id'],'','non-html'
            raw=response.read(1_500_000)
            enc=response.headers.get_content_charset() or 'utf-8'
            html=raw.decode(enc,errors='ignore')
            return record['id'],extract_image(response.geturl(),html),'page'
    except Exception:
        return record['id'],'','fetch-failed'

records=json.loads(TARGET.read_text(encoding='utf-8'))
eligible=[r for r in records if r.get('url')]
results={}; modes={}
with ThreadPoolExecutor(max_workers=24) as pool:
    futures=[pool.submit(fetch,r) for r in eligible]
    for future in as_completed(futures):
        try: rid,image,mode=future.result()
        except Exception: continue
        results[rid]=image; modes[mode]=modes.get(mode,0)+1

before=sum(bool(r.get('mediaUrl')) for r in records)
for record in records:
    image=results.get(record['id'],'')
    if image: record['mediaUrl']=image
after=sum(bool(r.get('mediaUrl')) for r in records)
TARGET.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
report=json.loads(REPORT.read_text(encoding='utf-8'))
report['image_enrichment']={'records_checked':len(eligible),'images_before':before,'images_after':after,'images_added':max(0,after-before),'outcomes':modes}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report['image_enrichment'],ensure_ascii=False,indent=2))
