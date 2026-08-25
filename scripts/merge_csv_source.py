import csv, json, re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'app'/'records.json'; COMPARE=ROOT/'comparison_report.json'
CSV_PATH=Path(r'C:\Users\Aarushi Gupta\Downloads\table.csv')
LABEL='Additional table.csv source inventory'
def txt(v): return str(v).strip() if v is not None else ''
def norm(v): return re.sub(r'[^a-z0-9]+',' ',txt(v).lower()).strip()
def canonical(url):
 try:
  p=urlsplit(txt(url)); return urlunsplit((p.scheme.lower(),p.netloc.lower().removeprefix('www.'),re.sub(r'/+','/',p.path).rstrip('/'),'',''))
 except Exception: return txt(url).rstrip('/')
def broad(v):
 s=norm(v)
 if any(k in s for k in ('video','podcast','youtube','broadcast')): return 'Video'
 if any(k in s for k in ('pdf','report','publication','brochure')): return 'PDF'
 if any(k in s for k in ('photo','image')): return 'Image'
 if any(k in s for k in ('social','linkedin','twitter','profile')): return 'Social'
 if any(k in s for k in ('news','article','interview','press')): return 'Article'
 return 'Other'
def year(date):
 m=re.search(r'20\d{2}',txt(date)); return int(m.group()) if m else 0

records=json.loads(TARGET.read_text(encoding='utf-8'))
by_url={canonical(r.get('url')):r for r in records if r.get('url')}
by_key={(norm(r.get('title')),r.get('date','')):r for r in records}
added=matched=0
with CSV_PATH.open('r',encoding='utf-8-sig',newline='') as f:
 for d in csv.DictReader(f):
  url=txt(d.get('URL')); title=txt(d.get('Title / Headline')); date=txt(d.get('Date'))
  if not url and not title: continue
  cu=canonical(url); key=(norm(title),date)
  found=by_url.get(cu) if cu else by_key.get(key)
  if found:
   found['duplicateCount']=int(found.get('duplicateCount',1))+1
   if LABEL not in found.get('sourceDataset',''): found['sourceDataset']=f"{found.get('sourceDataset','')}; {LABEL}".strip('; ')
   found['mergeNotes']=f"{found.get('mergeNotes','')}; Also present in table.csv".strip('; ')
   matched+=1; continue
  supplied=txt(d.get('Verified'))
  rec={'id':'','date':date if re.fullmatch(r'20\d{2}-\d{2}-\d{2}',date) else '','year':year(date),'type':broad(d.get('Type')),'format':txt(d.get('Type')) or 'CSV source','publisher':txt(d.get('Publication / Channel')) or txt(d.get('Source Platform')) or 'Publisher not recorded','title':title or 'Untitled source','language':txt(d.get('Language')) or 'Unknown','presence':'Named / occurrence reported','topic':txt(d.get('Source Platform')) or 'General','description':txt(d.get('Context / Snippet')),'status':'Unverified' if 'unverified' in supplied.lower() else 'Partially verified','url':url or None,'mediaUrl':None,'notes':f'Imported from table.csv. Supplied verification label: {supplied or "not stated"}; independent review pending.','sourceDataset':LABEL,'duplicateCount':1,'mergeNotes':'New CSV record absent from prior 345-record master'}
  records.append(rec); added+=1
  if cu: by_url[cu]=rec
  by_key[key]=rec

records.sort(key=lambda r:(r.get('date') or '0000',r.get('title') or ''),reverse=True)
for i,r in enumerate(records,1): r['id']=f'PG{i:03d}'
TARGET.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
comparison=json.loads(COMPARE.read_text(encoding='utf-8'))
comparison['duplicate_workbook_ignored']=True
comparison['csv_source']={'input_rows':added+matched,'added':added,'matched':matched}
comparison['prior_master_records']=345
comparison['final_records']=len(records)
comparison['with_url']=sum(bool(r.get('url')) for r in records)
comparison['without_url']=sum(not r.get('url') for r in records)
comparison['verified']=sum(r.get('status')=='Verified' for r in records)
comparison['partial']=sum(r.get('status')=='Partially verified' for r in records)
comparison['unverified']=sum(r.get('status')=='Unverified' for r in records)
comparison['duplicates_merged']=sum(max(0,int(r.get('duplicateCount',1))-1) for r in records)
COMPARE.write_text(json.dumps(comparison,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(comparison,ensure_ascii=False,indent=2))
