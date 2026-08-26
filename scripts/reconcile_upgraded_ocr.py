import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / "app" / "records.json"
MANIFEST_PATH = ROOT / "media-archive" / "evidence_manifest_private.json"
CHECKPOINT_PATH = ROOT / "artifact-work" / "ocr-v2-checkpoint.json"
REPORT_PATH = ROOT / "ocr_upgrade_report.json"


def text(value):
    return str(value).strip() if value is not None else ""


def norm(value):
    return re.sub(r"[^a-z0-9\u0900-\u097f]+", " ", text(value).lower()).strip()


def tokens(value):
    return [token for token in norm(value).split() if len(token) >= 3]


def language_parts(title):
    """Keep Latin and Devanagari title variants separate when both are supplied."""
    value = text(title)
    latin = " ".join(re.findall(r"[A-Za-z0-9][A-Za-z0-9' -]*", value))
    devanagari = " ".join(re.findall(r"[\u0900-\u097f][\u0900-\u097f\s।-]*", value))
    return [part.strip() for part in (latin, devanagari) if len(norm(part)) >= 5]


def token_coverage(title_part, corpus):
    wanted = tokens(title_part)
    found = tokens(corpus)
    if not wanted or not found:
        return 0.0
    found_set = set(found)
    matched = 0.0
    for wanted_token in wanted:
        if wanted_token in found_set:
            matched += 1.0
            continue
        best = max(
            (SequenceMatcher(None, wanted_token, found_token).ratio() for found_token in found
             if abs(len(wanted_token) - len(found_token)) <= 3),
            default=0.0,
        )
        if best >= 0.86:
            matched += 0.75
    return matched / len(wanted)


def title_score(title, corpus, headlines):
    scores = []
    for part in language_parts(title) or [title]:
        wanted = norm(part)
        if not wanted:
            continue
        coverage = token_coverage(part, corpus)
        sequence = max(
            (SequenceMatcher(None, wanted, norm(headline)).ratio() for headline in headlines if headline),
            default=0.0,
        )
        phrase_bonus = 1.0 if wanted in norm(corpus) else 0.0
        scores.append(max(coverage, sequence, phrase_bonus))
    return round(max(scores, default=0.0), 3)


def evidence_payload(item):
    return {
        "sha256": item["sha256"],
        "thumbnailUrl": item["thumbnailUrl"],
        "originalFilename": item["originalFilename"],
        "publisher": item["publisher"],
        "date": item["date"],
        "page": item.get("page"),
        "quality": item["quality"],
        "ocrConfidence": item.get("ocrConfidence"),
        "ocrEngine": item.get("ocrEngine") or "Tesseract 5",
        "ocrModel": item.get("ocrModel"),
        "ocrReviewStatus": item.get("ocrReviewStatus"),
    }


def attach(record, item):
    evidence = record.setdefault("evidenceImages", [])
    if not any(existing.get("sha256") == item["sha256"] for existing in evidence):
        evidence.append(evidence_payload(item))
    if not record.get("evidenceImageUrl"):
        record["evidenceImageUrl"] = item["thumbnailUrl"]
    record["verificationMethod"] = "AI OCR candidate match; editorial review recommended"


def main():
    parser = argparse.ArgumentParser(description="Conservatively reconcile upgraded OCR against existing candidate records.")
    parser.add_argument("--apply", action="store_true", help="Write accepted matches into the private manifest and records.")
    args = parser.parse_args()

    records = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")) if CHECKPOINT_PATH.exists() else {}
    by_id = {record["id"]: record for record in records}
    decisions = []

    for item in manifest:
        if not text(item.get("matchStatus")).startswith("Ambiguous"):
            continue
        candidates = [by_id[record_id] for record_id in item.get("candidateRecordIds", []) if record_id in by_id]
        if len(candidates) < 2:
            continue
        upgraded = checkpoint.get(item["id"], {})
        corpus = "\n".join(filter(None, [
            text(item.get("ocrText")),
            text(upgraded.get("ocrText")),
        ]))
        headlines = list(filter(None, [
            text(item.get("ocrHeadline")),
            text(upgraded.get("ocrHeadline")),
        ]))
        scored = sorted(
            ((title_score(record.get("title"), corpus, headlines), record) for record in candidates),
            reverse=True,
            key=lambda pair: pair[0],
        )
        best_score, best_record = scored[0]
        second_score = scored[1][0]
        margin = round(best_score - second_score, 3)
        # Whole-article text often mentions a competing candidate.  Require a
        # near-exact title signal plus a clear margin so body-text overlap alone
        # cannot create a false connection.
        accepted = (best_score >= 0.90 and margin >= 0.15) or (best_score >= 0.80 and margin >= 0.35)
        decision = {
            "clippingId": item["id"],
            "date": item.get("date"),
            "publisher": item.get("publisher"),
            "accepted": accepted,
            "bestRecordId": best_record["id"],
            "bestTitle": best_record.get("title"),
            "bestScore": best_score,
            "secondScore": second_score,
            "margin": margin,
            "candidateScores": [
                {"recordId": record["id"], "score": score, "title": record.get("title")}
                for score, record in scored
            ],
            "ocrHeadline": headlines[-1] if headlines else None,
        }
        decisions.append(decision)
        if not args.apply:
            continue
        if accepted:
            attach(best_record, item)
            item["matchedRecordId"] = best_record["id"]
            item["matchStatus"] = "Matched by OCR (PP-OCRv5; editorial review recommended)"
            item["reviewDecision"] = (
                f"AI OCR candidate match to {best_record['id']}: title score {best_score:.3f}, "
                f"margin {margin:.3f}. Check against the authentic clipping image."
            )
        else:
            item["reviewDecision"] = (
                f"Still ambiguous after multilingual OCR; best candidate {best_record['id']} "
                f"scored {best_score:.3f} with margin {margin:.3f}. Human review required."
            )

    report = {
        "method": "PP-OCRv5 English and Devanagari recognition, compared only with pre-existing candidate records",
        "policy": "AI transcription and matching are aids, not verification; original clipping remains the evidence of record",
        "ambiguousReviewed": len(decisions),
        "acceptedMatches": sum(decision["accepted"] for decision in decisions),
        "remainingAmbiguous": sum(not decision["accepted"] for decision in decisions),
        "decisions": decisions,
    }
    if args.apply:
        RECORDS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "decisions"}, ensure_ascii=False, indent=2))
    for decision in decisions:
        if decision["accepted"]:
            print(json.dumps(decision, ensure_ascii=True))


if __name__ == "__main__":
    main()
