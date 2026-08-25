import json
from pathlib import Path
import openpyxl

SOURCE = Path(r"C:\Users\Aarushi Gupta\Documents\ChatGPT\Custom gpt\outputs\01a0339d-9925-7d90-b682-1f763ec33aed\MCCIA_Media_Master_2018_2026.xlsx")
TARGET = Path(__file__).resolve().parents[1] / "app" / "records.json"

sheet = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)["Master Media Archive"]
rows = list(sheet.iter_rows(values_only=True))
headers = rows[0]
records = []

for row in rows[1:]:
    item = dict(zip(headers, row))
    value = item["Date"]
    date = value.strftime("%Y-%m-%d") if hasattr(value, "strftime") else str(value or "")
    media_type = str(item["Media Type"] or "Other")
    broad_type = (
        "Video" if "video" in media_type.lower() else
        "PDF" if "pdf" in media_type.lower() else
        "Image" if "image" in media_type.lower() else
        "Social" if "social" in media_type.lower() else
        "Article" if any(word in media_type.lower() for word in ("article", "interview", "release", "brief")) else
        "Other"
    )
    records.append({
        "id": item["ID"], "date": date, "year": item["Year"],
        "type": broad_type, "format": media_type,
        "publisher": item["Publisher / Platform"], "title": item["Headline / Item"],
        "language": item["Language"] or "Unknown", "presence": item["DG Presence"] or "Named",
        "topic": item["Topic"] or "General", "description": item["Description / Evidence"] or "",
        "status": item["Verification"] or "Unverified", "url": item["Source URL"] or None,
        "mediaUrl": item["Image / Video URL"] or None, "notes": item["Research Notes"] or ""
    })

TARGET.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {len(records)} records to {TARGET}")
