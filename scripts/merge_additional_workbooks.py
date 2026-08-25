import json, re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import openpyxl

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'app'/'records.json'
COMPARE=ROOT/'comparison_report.json'
FILES=[
 (Path(r'C:\Users\Aarushi Gupta\Downloads\1787635000092-MCCIA_DG_Prashant_Girbane_Comprehensive_Research_2018_2026.xlsx'),'All Sources Master List','Additional comprehensive workbook A'),
 (Path(r'C:\Users\Aarushi Gupta\Downloads\1787634992971-Prashant_Girbane_MCCIA_Comprehensive_Research.xlsx'),'All Sources','Additional comprehensive workbook B'),
]
def txt(v): return str(v).strip() if v is not None else ''
def norm(v): return re.sub(r'[^a-z0-9]+',' ',txt(v).lower()).strip()
def canonical(url):
 try:
  p=urlsplit(txt(url)); return urlunsplit((p.scheme.lower(),p.netloc.lower().removeprefix('www.'),re.sub(r'/+','/',p.path).rstrip('/'),'',''))
 except Exception: return txt(url).rstrip('/')
def date_value(v):
 s=txt(v); m=re.search(r'(20\d{2})[-/](\d{1,2})(?:[-/](\d{1,2}))?',s)
 return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3) or 1):02d}' if m and not re.search(r'20\d{2}\s*[-–]\s*20\d{2}',s) else ''
def year_value(v,date=''):
 s=txt(v)
 if re.search(r'20\d{2}\s*[-–]\s*20\d{2}',s): return 0
 m=re.search(r'20\d{2}',date or s); return int(m.group()) if m else 0
def broad_type(v):
 s=norm(v)
 if any(k in s for k in ('video','tv interview','youtube')): return 'Video'
 if any(k in s for k in ('pdf','publication','report','brochure','annual report')): return 'PDF'
 if any(k in s for k in ('image','photo')): return 'Image'
 if any(k in s for k in ('social','linkedin','twitter','x post')): return 'Social'
 if any(k in s for k in ('article','interview','news','press release','op ed')): return 'Article'
 return 'Other'

records=json.loads(TARGET.read_text(encoding='utf-8'))
by_url={canonical(r.get('url')):r for r in records if r.get('url')}
by_key={(norm(r.get('title')),r.get('date','')):r for r in records}
add_stats=[]

for path,sheet_name,label in FILES:
 wb=openpyxl.load_workbook(path,data_only=True,read_only=True); ws=wb[sheet_name]
 rows=list(ws.iter_rows(values_only=True)); headers=[txt(v) for v in rows[0]]
 added=matched=0
 for row in rows[1:]:
  d=dict(zip(headers,row))
  if sheet_name=='All Sources Master List':
   url=txt(d.get('Source URL')); title=txt(d.get('Title/Headline')); dt=date_value(d.get('Date')); yr=year_value(d.get('Year'),dt); fmt=txt(d.get('Content Type')); pub=txt(d.get('Source Name')); lang=txt(d.get('Language')) or 'Unknown'; topic=txt(d.get('Category')) or 'General'; desc=txt(d.get('Summary/Key Points')); supplied=txt(d.get('Verification Status')); presence='Name / photo / relevance reported'
  else:
   url=txt(d.get('URL')); title=txt(d.get('Title/Headline')); dt=date_value(d.get('Date')); yr=year_value(d.get('Year'),dt); fmt=txt(d.get('Source Type')); pub=txt(d.get('Platform/Channel')); lang=txt(d.get('Language')) or 'Unknown'; topic='General'; desc=txt(d.get('Brief Description')); supplied=txt(d.get('Verification Status')); presence=txt(d.get('Mention Type')) or 'Named / occurrence reported'
  if not url and not title: continue
  cu=canonical(url); key=(norm(title),dt)
  found=by_url.get(cu) if cu else by_key.get(key)
  if found:
   found['duplicateCount']=int(found.get('duplicateCount',1))+1
   if label not in found.get('sourceDataset',''): found['sourceDataset']=f"{found.get('sourceDataset','')}; {label}".strip('; ')
   found['mergeNotes']=f"{found.get('mergeNotes','')}; Also present in {label}".strip('; ')
   matched+=1; continue
  rec={'id':'','date':dt,'year':yr,'type':broad_type(fmt),'format':fmt or 'Web source','publisher':pub or 'Publisher not recorded','title':title or 'Untitled source','language':lang,'presence':presence,'topic':topic,'description':desc,'status':'Unverified' if 'unverified' in supplied.lower() else 'Partially verified','url':url or None,'mediaUrl':None,'notes':f'Imported from {label}. Supplied verification label: {supplied or "not stated"}; independent review pending.','sourceDataset':label,'duplicateCount':1,'mergeNotes':'New record absent from prior 246-record master'}
  records.append(rec); added+=1
  if cu: by_url[cu]=rec
  by_key[key]=rec
 add_stats.append({'source':label,'input_rows':len(rows)-1,'added':added,'matched':matched})

records.sort(key=lambda r:(r.get('date') or '0000',r.get('title') or ''),reverse=True)
for i,r in enumerate(records,1): r['id']=f'PG{i:03d}'
TARGET.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
comparison=json.loads(COMPARE.read_text(encoding='utf-8'))
comparison['additional_workbooks']=add_stats
comparison['prior_master_records']=comparison.get('final_records',246)
comparison['final_records']=len(records)
comparison['with_url']=sum(bool(r.get('url')) for r in records)
comparison['without_url']=sum(not r.get('url') for r in records)
comparison['verified']=sum(r.get('status')=='Verified' for r in records)
comparison['partial']=sum(r.get('status')=='Partially verified' for r in records)
comparison['unverified']=sum(r.get('status')=='Unverified' for r in records)
comparison['duplicates_merged']=sum(max(0,int(r.get('duplicateCount',1))-1) for r in records)
COMPARE.write_text(json.dumps(comparison,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(comparison,ensure_ascii=False,indent=2))
