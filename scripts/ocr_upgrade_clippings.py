"""Upgrade clipping OCR with PaddleOCR PP-OCRv5 multilingual models.

The archive contains English, Hindi, and Marathi newspaper scans.  This script
uses a shared mobile text detector plus language-specific PP-OCRv5 recognition
models, preserves the previous Tesseract reading, and only promotes a new
reading when a conservative quality score improves.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from pathlib import Path

import cv2
import numpy as np
from paddleocr import PaddleOCR


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_MANIFEST = ROOT / "media-archive" / "evidence_manifest_private.json"
CHECKPOINT = ROOT / "artifact-work" / "ocr-v2-checkpoint.json"
RESULTS_DIR = ROOT / "artifact-work" / "ocr-v2-results"

ENGLISH_PUBLISHERS = {
    "Times of India",
    "Hindustan Times",
    "Indian Express",
    "Financial Express",
    "Economic Times",
    "Business Line",
    "Mint",
    "Pune Mirror",
}

REJECT_HEADLINE_MARKERS = {
    "page no",
    "p.no",
    "times of india",
    "hindustan times",
    "indian express",
    "maharashtra times",
    "loksatta",
    "pudhari",
    "aaj ka anand",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=("pilot", "ambiguous", "all"), default="pilot")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def alpha_chars(value: str) -> list[str]:
    return re.findall(r"[A-Za-z\u0900-\u097f]", value or "")


def script_ratio(value: str, expected: str) -> float:
    chars = alpha_chars(value)
    if not chars:
        return 0.0
    if expected == "latin":
        matched = sum("A" <= char <= "z" for char in chars)
    else:
        matched = sum("\u0900" <= char <= "\u097f" for char in chars)
    return matched / len(chars)


def reading_score(value: str, confidence: float, expected: str) -> float:
    clean = " ".join((value or "").split())
    chars = alpha_chars(clean)
    if not chars:
        return 0.0
    valid_ratio = script_ratio(clean, expected)
    singletons = sum(len(token) == 1 for token in clean.split()) / max(1, len(clean.split()))
    length_score = min(1.0, math.log10(max(10, len(clean))) / 3.0)
    normalized_confidence = confidence / 100 if confidence > 1 else confidence
    return round(
        100
        * (
            0.48 * normalized_confidence
            + 0.27 * valid_ratio
            + 0.20 * length_score
            + 0.05 * (1 - min(1.0, singletons * 2))
        ),
        1,
    )


def prepare_image(path: str) -> np.ndarray:
    raw = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to decode image: {path}")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Remove large white scanner borders while preserving a small safety margin.
    mask = gray < 247
    points = cv2.findNonZero(mask.astype(np.uint8))
    if points is not None:
        x, y, width, height = cv2.boundingRect(points)
        margin = max(12, round(min(image.shape[:2]) * 0.012))
        x0, y0 = max(0, x - margin), max(0, y - margin)
        x1 = min(image.shape[1], x + width + margin)
        y1 = min(image.shape[0], y + height + margin)
        image = image[y0:y1, x0:x1]
        gray = gray[y0:y1, x0:x1]

    # Newspaper scans benefit from local contrast and mild sharpening.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(12, 12))
    enhanced = clahe.apply(gray)
    enhanced = cv2.addWeighted(enhanced, 1.35, cv2.GaussianBlur(enhanced, (0, 0), 1.0), -0.35, 0)

    height, width = enhanced.shape
    minimum_short_side = 1200
    maximum_long_side = 3000
    scale = max(1.0, minimum_short_side / max(1, min(height, width)))
    scale = min(scale, maximum_long_side / max(height, width))
    if abs(scale - 1.0) > 0.05:
        enhanced = cv2.resize(
            enhanced,
            (round(width * scale), round(height * scale)),
            interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA,
        )
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def result_payload(result) -> dict:
    payload = result.json
    return payload.get("res", payload)


def extract_reading(payload: dict, expected: str) -> tuple[str, str, float, int]:
    texts = list(payload.get("rec_texts") or [])
    scores = [float(value) for value in (payload.get("rec_scores") or [])]
    boxes = list(payload.get("rec_boxes") or [])
    if not boxes:
        boxes = []
        for polygon in payload.get("rec_polys") or []:
            xs = [point[0] for point in polygon]
            ys = [point[1] for point in polygon]
            boxes.append([min(xs), min(ys), max(xs), max(ys)])

    rows = []
    for index, value in enumerate(texts):
        clean = " ".join(str(value).split())
        score = scores[index] if index < len(scores) else 0.0
        box = boxes[index] if index < len(boxes) else [0, index * 10, 0, index * 10 + 1]
        if clean and score >= 0.35 and len(alpha_chars(clean)) >= 2:
            rows.append({"text": clean, "score": score, "box": [int(v) for v in box]})

    rows.sort(key=lambda row: (row["box"][1], row["box"][0]))
    full_text = "\n".join(row["text"] for row in rows)
    if not rows:
        return "", "", 0.0, 0

    image_height = max(row["box"][3] for row in rows)
    heights = sorted(max(1, row["box"][3] - row["box"][1]) for row in rows)
    median_height = heights[len(heights) // 2]
    headline_candidates = []
    for row in rows:
        text = row["text"]
        lower = text.lower()
        letters = alpha_chars(text)
        x0, y0, x1, y1 = row["box"]
        height = max(1, y1 - y0)
        if len(text) < 8 or len(text) > 190 or len(letters) < 6:
            continue
        if y0 > image_height * 0.48:
            continue
        if script_ratio(text, expected) < 0.62:
            continue
        if any(marker in lower for marker in REJECT_HEADLINE_MARKERS) and len(text) < 55:
            continue
        headline_score = (
            min(4.0, height / max(1, median_height)) * 2.2
            + max(0.0, 1 - y0 / max(1, image_height)) * 1.4
            + min(1.0, len(text) / 60)
            + row["score"]
        )
        headline_candidates.append((headline_score, row))

    headline_row = max(headline_candidates, default=(0, rows[0]), key=lambda pair: pair[0])[1]
    headline_height = max(1, headline_row["box"][3] - headline_row["box"][1])
    headline_x0, headline_y0, headline_x1, _ = headline_row["box"]
    joined = []
    for row in rows:
        x0, y0, x1, y1 = row["box"]
        height = max(1, y1 - y0)
        overlap = max(0, min(x1, headline_x1) - max(x0, headline_x0))
        overlap_ratio = overlap / max(1, min(x1 - x0, headline_x1 - headline_x0))
        if (
            height >= headline_height * 0.58
            and abs(y0 - headline_y0) <= headline_height * 3.4
            and (overlap_ratio >= 0.25 or abs(x0 - headline_x0) <= headline_height * 2)
            and script_ratio(row["text"], expected) >= 0.62
            and len(joined) < 3
        ):
            joined.append(row)
    joined.sort(key=lambda row: (row["box"][1], row["box"][0]))
    headline = " ".join(row["text"] for row in joined) or headline_row["text"]
    weighted_confidence = sum(row["score"] * len(row["text"]) for row in rows) / max(
        1, sum(len(row["text"]) for row in rows)
    )
    return full_text, headline, round(weighted_confidence * 100, 1), len(rows)


def choose_items(manifest: list[dict], scope: str, limit: int) -> list[dict]:
    if scope == "all":
        items = manifest
    elif scope == "ambiguous":
        items = [item for item in manifest if str(item.get("matchStatus", "")).startswith("Ambiguous")]
    else:
        ambiguous = [item for item in manifest if str(item.get("matchStatus", "")).startswith("Ambiguous")]
        timeouts = [item for item in ambiguous if item.get("ocrStatus") == "Timed out"]
        lowest = sorted(
            [item for item in ambiguous if item.get("ocrStatus") == "Completed"],
            key=lambda item: float(item.get("ocrConfidence") or 0),
        )
        picks = timeouts + lowest[:12]
        # Keep the pilot diverse across publishers while retaining the hard cases.
        seen, items = set(), []
        for item in picks + ambiguous:
            key = item.get("id")
            if key in seen:
                continue
            if len(items) >= 18:
                break
            seen.add(key)
            items.append(item)
    return items[:limit] if limit else items


def make_pipeline(language: str) -> PaddleOCR:
    recognition_model = (
        "en_PP-OCRv5_mobile_rec" if language == "en" else "devanagari_PP-OCRv5_mobile_rec"
    )
    return PaddleOCR(
        lang=language,
        ocr_version="PP-OCRv5",
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name=recognition_model,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_det_limit_side_len=1600,
        text_det_limit_type="max",
        text_rec_score_thresh=0.0,
        device="cpu",
        enable_mkldnn=True,
        cpu_threads=4,
    )


def main() -> None:
    args = parse_args()
    manifest = json.loads(PRIVATE_MANIFEST.read_text(encoding="utf-8"))
    items = choose_items(manifest, args.scope, args.limit)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8")) if CHECKPOINT.exists() else {}
    pipelines: dict[str, PaddleOCR] = {}
    results = []
    started = time.perf_counter()

    for index, item in enumerate(items, 1):
        item_id = item["id"]
        if not args.force and item_id in checkpoint:
            result = checkpoint[item_id]
        else:
            language = "en" if item.get("publisher") in ENGLISH_PUBLISHERS else "hi"
            if language not in pipelines:
                pipelines[language] = make_pipeline(language)
            image = prepare_image(item["originalLocalPath"])
            item_started = time.perf_counter()
            expected = "latin" if language == "en" else "devanagari"
            prediction = next(iter(pipelines[language].predict(image)))
            text, headline, confidence, line_count = extract_reading(
                result_payload(prediction), expected
            )
            old_text = str(item.get("ocrText") or "")
            old_confidence = float(item.get("ocrConfidence") or 0)
            old_score = reading_score(old_text, old_confidence, expected)
            new_score = reading_score(text, confidence, expected)
            promote = bool(text) and (
                not old_text
                or new_score >= old_score + 4
                or (new_score >= old_score and len(text) >= len(old_text) * 1.35)
            )
            result = {
                "id": item_id,
                "publisher": item.get("publisher"),
                "date": item.get("date"),
                "languageModel": language,
                "model": recognition_model_name(language),
                "ocrText": text,
                "ocrHeadline": headline,
                "ocrConfidence": confidence,
                "lineCount": line_count,
                "oldScore": old_score,
                "newScore": new_score,
                "promote": promote,
                "elapsedSeconds": round(time.perf_counter() - item_started, 2),
            }
            checkpoint[item_id] = result
            CHECKPOINT.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding="utf-8")

        expected = "latin" if result.get("languageModel") == "en" else "devanagari"
        old_headline = str(item.get("ocrHeadline") or "")
        old_headline_score = reading_score(
            old_headline, float(item.get("ocrConfidence") or 0), expected
        )
        new_headline_score = reading_score(
            str(result.get("ocrHeadline") or ""), float(result.get("ocrConfidence") or 0), expected
        )
        result["oldHeadlineScore"] = old_headline_score
        result["newHeadlineScore"] = new_headline_score
        result["headlinePromote"] = bool(result.get("ocrHeadline")) and (
            not old_headline
            or new_headline_score >= old_headline_score + 3
            or (
                new_headline_score >= old_headline_score
                and len(str(result.get("ocrHeadline") or "")) >= len(old_headline) * 1.35
            )
        )
        checkpoint[item_id] = result

        if args.apply and result.get("promote"):
            item.setdefault(
                "legacyOcr",
                {
                    "engine": item.get("ocrEngine") or "Tesseract 5",
                    "text": item.get("ocrText"),
                    "headline": item.get("ocrHeadline"),
                    "confidence": item.get("ocrConfidence"),
                    "status": item.get("ocrStatus"),
                },
            )
            item["ocrText"] = result["ocrText"]
            if result.get("headlinePromote"):
                item["ocrHeadline"] = result["ocrHeadline"]
            item["ocrConfidence"] = result["ocrConfidence"]
            item["ocrStatus"] = "Completed"
            item["ocrEngine"] = "PaddleOCR"
            item["ocrModel"] = result["model"]
            item["ocrReviewStatus"] = "AI transcription; editorial verification recommended"

        results.append(result)
        print(
            json.dumps(
                {
                    "processed": index,
                    "total": len(items),
                    "id": item_id,
                    "promote": result.get("promote"),
                    "oldScore": result.get("oldScore"),
                    "newScore": result.get("newScore"),
                    "seconds": result.get("elapsedSeconds"),
                }
            ),
            flush=True,
        )

    if args.apply:
        PRIVATE_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "scope": args.scope,
        "processed": len(results),
        "promoted": sum(bool(result.get("promote")) for result in results),
        "elapsedSeconds": round(time.perf_counter() - started, 2),
        "results": results,
    }
    output = RESULTS_DIR / f"{args.scope}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("scope", "processed", "promoted", "elapsedSeconds")}, indent=2))


def recognition_model_name(language: str) -> str:
    return "en_PP-OCRv5_mobile_rec" if language == "en" else "devanagari_PP-OCRv5_mobile_rec"


if __name__ == "__main__":
    main()
