import json, re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\Aarushi Gupta\.codex\attachments\532fa6c4-4ac8-404f-8f2b-10468bfb560d\pasted-text.txt')
TARGET = ROOT / 'app' / 'records.json'
COMPARE = ROOT / 'comparison_report.json'
LABEL = 'Pasted exhaustive MCCIA research inventory'

DISCOVERED = [
 ('2025-11-01','Looking Back. Looking Forward.','LinkedIn / Prashant Girbane','https://www.linkedin.com/posts/prashant-girbane-245840_looking-back-looking-forward-activity-7280237279053238272-MQ6E','Analysis of Pune defence and electronics manufacturing and MCCIA ecosystem work.'),
 ('2025-11-01','MCCIA Semiconductor Ecosystem Conference 2025','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_mccia-semiconductorindia-sec2025-activity-7389549122841726977-kbDQ','Conference recap naming Prashant Girbane and MCCIA leaders.'),
 ('2026-08-01','AI Diffusion in Rural India Matters','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_ai-diffusion-innovation-activity-7480533674803793920-aQmO','Prashant Girbane discusses last-mile AI diffusion for MSMEs.'),
 ('2026-02-01','MCCIA PIBS 2026 Day 1','LinkedIn / Sanjeebit Choudhury','https://www.linkedin.com/posts/sanjeebit-choudhury_mcciapibs2026-activity-7426898350349860864-kXPa','PIBS session moderated by Prashant Girbane.'),
 ('2024-10-01','MCCIA Sampada agriculture and sustainable growth post','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_mccia-sampada-maharashtraagriculture-activity-7255516418442465280-tuKy','MCCIA publication post naming Prashant Girbane.'),
 ('2025-01-01','Prashant Girbane welcomed as Independent Director','LinkedIn / Varad Deshpande','https://www.linkedin.com/posts/deshpandevarad_above-and-beyond-welcome-sir-activity-7273370499215224832-jP_B','Profile information on Prashant Girbane and his MCCIA role.'),
 ('2026-04-01','MCCIA Youth Fellowship Program 2026-27','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_mcciafellowship-youthfellowship-careeropportunity-activity-7442143276700278785-SxFJ','Fellowship announcement naming Prashant Girbane and the MCCIA team.'),
 ('2025-08-04','MoFPI–MCCIA Regional Industry Meet','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_mofpi-mccia-foodprocessingindia-activity-7363092957450637313-YEBQ','Regional food processing industry meeting naming Prashant Girbane.'),
 ('2026-04-30','MCCIA AI Hackathon — Build The WAVE','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_aihackathon-buildthewave-mccia-activity-7456973480660508672-cCLU','Hackathon recap naming Prashant Girbane and MCCIA leaders.'),
 ('2026-01-01','Prashant Girbane on Unlocking Investments in Pune','LinkedIn / MCCIA','https://www.linkedin.com/posts/mcciapune_hear-from-the-director-general-of-mccia-prashant-activity-7417513390270500864-sQiK','Director General perspective on attracting investment to Pune.'),
 ('2026-04-01','MCCIA Agritech Summit','LinkedIn / Aniket Shinde','https://www.linkedin.com/posts/aniket-shinde-794496234_agritech-ai-drones-activity-7441529322391207936-I13J','Agritech summit where Prashant Girbane set the context for industry-startup collaboration.'),
 ('2025-12-12','Agriculture Export Facilitation Centre — Yashogatha','MCCIA','https://www.mcciapune.com/media/Publication/Publication_File/MCCIA_AEFC_Yashogatha_FINAL_All_Pages_12-12-2025.pdf','PDF containing a Marathi message attributed to Prashant Girbane.'),
 ('2025-11-18','Semiconductor Ecosystem Conference 2025 Report','MCCIA','https://www.mcciapune.com/media/Publication/Publication_File/MCCIA_SEC_Report_2025_Proof_18-11-25.pdf','Conference report with a welcome address by Prashant Girbane.'),
 ('2026-01-01','MCCIA Industrial Relations Conclave 2026 programme','MCCIA','https://mcciapune.com/media/printmedia2023/Tentative_Block__Program_MCCIAs_IR_Conclave_2026.pdf','Programme listing Prashant Girbane, Director General, MCCIA.'),
 ('2024-08-28','Pune International Business Summit 2024 brochure','Embassy of India, Belgrade','https://eoibelgrade.gov.in/public_files/assets/pdf/MCCIA_PIBS_28_Aug_2024.pdf','PIBS brochure listing Prashant Girbane as Director General, MCCIA.'),
 ('2025-12-01','MCCIA Pune GCC Report','MCCIA','https://www.mcciapune.com/media/Publication/Publication_File/MCCIA_Pune_GCC_Report_FINAL_FOR_PRINT.pdf','Report containing a welcome address by Prashant Girbane.'),
 ('2021-01-01','MCCIA January 2021 publication','MCCIA','https://www.mcciapune.com/media/Publication/Publication_File/January_2021_-_Web.pdf','Publication showing Prashant Girbane receiving steam inhalers for MCCIA staff.'),
]

def text(v): return str(v).strip() if v is not None else ''
def norm(v): return re.sub(r'[^a-z0-9]+',' ',text(v).lower()).strip()
def canonical(url):
    p=urlsplit(text(url)); host=p.netloc.lower().removeprefix('www.'); path=re.sub(r'/+','/',p.path).rstrip('/')
    return urlunsplit(('',host,path,'',''))
def parse_date(value):
    value=text(value)
    for fmt in ('%b %Y','%B %Y','%Y-%m-%d'):
        try: return datetime.strptime(value,fmt).strftime('%Y-%m-%d')
        except ValueError: pass
    m=re.search(r'\b(20\d{2})\b',value)
    return f'{m.group(1)}-01-01' if m else ''
def media_type(url, section):
    low=(url+' '+section).lower()
    if '.pdf' in low: return 'PDF','PDF Document'
    if 'youtube' in low or 'youtu.be' in low or 'video' in low: return 'Video','Video'
    if any(x in low for x in ('linkedin','twitter.com','x.com','instagram','facebook')): return 'Social','Social Media'
    return 'Article','Web Article / Page'
def language(value): return 'Marathi' if re.search(r'[\u0900-\u097f]',value) else 'English'

records=json.loads(TARGET.read_text(encoding='utf-8'))
by_url={canonical(r.get('url')):r for r in records if r.get('url')}
rows=[]; section=''
for line in SOURCE.read_text(encoding='utf-8').splitlines():
    if line.startswith('## '): section=line.lstrip('# ').strip()
    if 'http' not in line or not line.lstrip().startswith('|'): continue
    cells=[re.sub(r'\[([^]]+)\]\([^)]*\)',r'\1',c).strip() for c in line.strip().strip('|').split('|')]
    urls=re.findall(r'https?://[^\s\]\)>|]+',line)
    for url in urls:
        url=url.rstrip('.,;')
        p=urlsplit(url)
        if section.startswith('18.') and p.path.rstrip('/') in ('','/'): continue
        date=parse_date(cells[0] if cells else '')
        title=cells[1] if len(cells)>1 else section
        if title.lower() in ('url','profile','source'): title=section
        publisher=(cells[-2] if len(cells)>2 else p.netloc).strip() or p.netloc
        desc=' — '.join(c for c in cells[2:-1] if c and c.lower() not in ('link','source'))
        rows.append((date,title,publisher,url,desc or section))
rows.extend(DISCOVERED)

unique=[]; seen=set()
for row in rows:
    key=canonical(row[3])
    if key and key not in seen: unique.append(row); seen.add(key)

added=matched=0
for dt,title,publisher,url,desc in unique:
    key=canonical(url)
    found=by_url.get(key)
    if found:
        matched+=1
        found['duplicateCount']=int(found.get('duplicateCount',1))+1
        if LABEL not in text(found.get('sourceDataset')):
            found['sourceDataset']='; '.join(filter(None,[text(found.get('sourceDataset')),LABEL]))
        continue
    kind,fmt=media_type(url,section)
    rec={'id':'','date':dt,'year':int(dt[:4]) if dt else None,'type':kind,'format':fmt,'publisher':publisher or urlsplit(url).netloc,'title':title or 'MCCIA / Prashant Girbane source','language':language(title+' '+desc),'presence':'MCCIA / Prashant Girbane occurrence reported','topic':'MCCIA / Prashant Girbane media monitoring','description':desc,'status':'Partially verified','url':url,'mediaUrl':url if kind in ('Image','Video') else None,'notes':'Imported from the pasted research inventory or corroborating web search. Direct URL retained; independent content review remains pending.','sourceDataset':LABEL,'duplicateCount':1,'mergeNotes':'New URL absent from prior 461-record master'}
    records.append(rec); by_url[key]=rec; added+=1

records.sort(key=lambda r:(text(r.get('date')),text(r.get('title'))),reverse=True)
for i,r in enumerate(records,1): r['id']=f'PG{i:03d}'
TARGET.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
comparison=json.loads(COMPARE.read_text(encoding='utf-8'))
comparison['pasted_inventory']={'input_unique_urls':len(unique),'added':added,'matched':matched,'raw_unique_urls':143}
comparison['prior_master_records']=461; comparison['final_records']=len(records)
comparison['with_url']=sum(bool(r.get('url')) for r in records); comparison['without_url']=sum(not r.get('url') for r in records)
comparison['verified']=sum(r.get('status')=='Verified' for r in records); comparison['partial']=sum(r.get('status')=='Partially verified' for r in records); comparison['unverified']=sum(r.get('status')=='Unverified' for r in records)
comparison['duplicates_merged']=sum(max(0,int(r.get('duplicateCount',1))-1) for r in records)
COMPARE.write_text(json.dumps(comparison,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(comparison,ensure_ascii=False,indent=2))
