#!/usr/bin/env python3
"""Extract text, headings, tables and images from a product PDF using PyMuPDF.

Outputs a single JSON file consumed by the Node ingestion pipeline.
Designed for local/CI use; OCR falls back to Tesseract when a page has no text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from statistics import median

import fitz


TESSERACT_CANDIDATES = [
    os.environ.get("TESSERACT_CMD", ""),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    "tesseract",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def find_tesseract() -> str | None:
    for candidate in TESSERACT_CANDIDATES:
        if not candidate:
            continue
        found = shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)
        if found:
            return found
    return None


def tesseract_langs(cmd: str) -> str:
    try:
        out = subprocess.run([cmd, "--list-langs"], capture_output=True, text=True, timeout=20)
        langs = [line.strip() for line in out.stdout.splitlines()[1:] if line.strip()]
        wanted = [lang for lang in ("eng", "chi_sim") if lang in langs]
        return "+".join(wanted) or "eng"
    except Exception:
        return "eng"


def ocr_page(page: fitz.Page, cmd: str, langs: str, dpi: int = 200) -> str:
    with tempfile.TemporaryDirectory(prefix="pdfocr-") as tmp:
        image_path = Path(tmp) / "page.png"
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        pix.save(str(image_path))
        proc = subprocess.run(
            [cmd, str(image_path), "stdout", "-l", langs, "--psm", "3"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        return proc.stdout.strip()


def clean_text(value: str) -> str:
    value = value.replace("\u00ad", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def classify_headings(page: fitz.Page) -> tuple[list[dict], float]:
    data = page.get_text("dict", sort=True)
    sizes: list[float] = []
    spans_by_block: list[tuple[dict, list[dict]]] = []
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        spans = [span for line in block.get("lines", []) for span in line.get("spans", []) if span.get("text", "").strip()]
        if not spans:
            continue
        spans_by_block.append((block, spans))
        sizes.extend(round(float(span.get("size", 0)), 1) for span in spans)
    body_size = median(sizes) if sizes else 10.0
    headings: list[dict] = []
    for block, spans in spans_by_block:
        text = clean_text(" ".join(span["text"] for span in spans))
        if not text or len(text) > 140:
            continue
        max_size = max(float(span.get("size", 0)) for span in spans)
        bold = any("bold" in (span.get("font", "").lower()) or (span.get("flags", 0) & 16) for span in spans)
        if max_size >= body_size * 1.55:
            level = 1
        elif max_size >= body_size * 1.28:
            level = 2
        elif max_size >= body_size * 1.12 or (bold and len(text) <= 90):
            level = 3
        else:
            continue
        headings.append(
            {
                "text": text,
                "level": level,
                "page": page.number + 1,
                "bbox": [round(v, 1) for v in block.get("bbox", [])],
            }
        )
    return headings, body_size


def extract_tables(page: fitz.Page) -> list[dict]:
    tables: list[dict] = []
    try:
        finder = page.find_tables()
    except Exception:
        return tables
    for index, table in enumerate(getattr(finder, "tables", [])):
        try:
            rows = table.extract()
        except Exception:
            continue
        cleaned: list[list[str]] = []
        for row in rows:
            if not row:
                continue
            cells = [clean_text(str(cell)) if cell is not None else "" for cell in row]
            if not any(cells):
                continue
            cleaned.append(cells)
        if len(cleaned) < 2:
            continue
        width = max(len(row) for row in cleaned)
        cleaned = [row + [""] * (width - len(row)) for row in cleaned]
        tables.append(
            {
                "page": page.number + 1,
                "index": index,
                "bbox": [round(v, 1) for v in table.bbox],
                "rows": cleaned,
                "markdown": "\n".join("| " + " | ".join(row) + " |" for row in cleaned),
            }
        )
    return tables


def nearby_caption(page: fitz.Page, rect: fitz.Rect) -> str:
    try:
        below = fitz.Rect(rect.x0, rect.y1 + 2, rect.x1, min(page.rect.y1, rect.y1 + 70))
        return clean_text(page.get_textbox(below))[:240]
    except Exception:
        return ""


def extract_images(
    doc: fitz.Document,
    page: fitz.Page,
    out_dir: Path,
    min_width: int,
    min_height: int,
    min_bytes: int,
    max_images: int,
    seen: dict[str, dict],
) -> list[dict]:
    images: list[dict] = []
    if len(seen) >= max_images:
        return images
    try:
        page_images = doc.get_page_images(page.number, full=True)
    except Exception:
        return images
    for image_index, info in enumerate(page_images):
        xref = info[0]
        width = int(info[2] or 0)
        height = int(info[3] or 0)
        if width < min_width or height < min_height:
            continue
        if width * height < 90000:
            continue
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        rect = rects[0] if rects else fitz.Rect(0, 0, 0, 0)
        try:
            payload = doc.extract_image(xref)
        except Exception:
            continue
        data = payload.get("image") or b""
        if len(data) < min_bytes:
            continue
        ext = (payload.get("ext") or "png").lower()
        if ext not in {"png", "jpeg", "jpg", "webp"}:
            continue
        digest = hashlib.sha1(data).hexdigest()
        if digest in seen:
            # Same asset reused on another page (page backgrounds, logos):
            # record the page on the single manifest entry instead of
            # emitting a duplicate row for every page it appears on.
            entry = seen[digest]
            if page.number + 1 not in entry["pages"]:
                entry["pages"].append(page.number + 1)
            continue
        if len(seen) >= max_images:
            break
        image_id = f"p{page.number + 1}-img{image_index + 1}-{digest[:8]}"
        filename = f"{image_id}.{'jpg' if ext == 'jpeg' else ext}"
        (out_dir / filename).write_bytes(data)
        entry = {
            "id": image_id,
            "file": filename,
            "width": width,
            "height": height,
            "bytes": len(data),
            "sha1": digest,
            "pages": [page.number + 1],
            "page": page.number + 1,
            "bbox": [round(v, 1) for v in rect],
            "aspect": round(width / height, 3) if height else 0,
            "caption": nearby_caption(page, rect) if rect.width else "",
            "duplicate": False,
        }
        seen[digest] = entry
        images.append(entry)
    return images


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", help="Path to the source PDF")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--ocr", choices=["auto", "always", "never"], default="auto")
    parser.add_argument("--min-width", type=int, default=240)
    parser.add_argument("--min-height", type=int, default=160)
    parser.add_argument("--min-bytes", type=int, default=12000)
    parser.add_argument("--max-images", type=int, default=80)
    args = parser.parse_args()

    pdf_path = Path(args.pdf).resolve()
    if not pdf_path.is_file():
        print(json.dumps({"ok": False, "error": f"PDF not found: {pdf_path}"}), file=sys.stderr)
        return 2
    out_dir = Path(args.out).resolve()
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    tesseract = find_tesseract()
    langs = tesseract_langs(tesseract) if tesseract else ""

    doc = fitz.open(pdf_path)
    pages: list[dict] = []
    headings: list[dict] = []
    tables: list[dict] = []
    images: list[dict] = []
    warnings: list[str] = []
    seen_images: dict[str, dict] = {}
    ocr_pages: list[int] = []

    for page in doc:
        raw_text = clean_text(page.get_text("text", sort=True))
        page_headings, body_size = classify_headings(page)
        page_tables = extract_tables(page)
        used_ocr = False
        if args.ocr == "always" or (args.ocr == "auto" and len(raw_text) < 60 and tesseract):
            ocr_text = ocr_page(page, tesseract, langs) if tesseract else ""
            if len(ocr_text) > len(raw_text):
                raw_text = clean_text(ocr_text)
                used_ocr = True
                ocr_pages.append(page.number + 1)
        if raw_text:
            headings.extend(page_headings)
        tables.extend(page_tables)
        images.extend(
            extract_images(
                doc,
                page,
                images_dir,
                args.min_width,
                args.min_height,
                args.min_bytes,
                args.max_images,
                seen_images,
            )
        )
        pages.append(
            {
                "page": page.number + 1,
                "width": round(page.rect.width, 1),
                "height": round(page.rect.height, 1),
                "text": raw_text,
                "chars": len(raw_text),
                "headings": page_headings,
                "tables": len(page_tables),
                "ocr": used_ocr,
            }
        )
        if len(raw_text) < 60:
            warnings.append(f"page {page.number + 1}: little or no extractable text")

    metadata = dict(doc.metadata or {})
    page_count = doc.page_count
    doc.close()

    title = clean_text(metadata.get("title") or "")
    if not title and headings:
        title = headings[0]["text"]

    extraction = {
        "source": {
            "type": "pdf",
            "file": str(pdf_path),
            "filename": pdf_path.name,
            "bytes": pdf_path.stat().st_size,
            "sha256": sha256_file(pdf_path),
            "pageCount": page_count,
            "title": title,
            "metadata": metadata,
            "ocrPages": ocr_pages,
            "tesseract": tesseract or None,
            "tesseractLangs": langs or None,
        },
        "pages": pages,
        "headings": headings,
        "tables": tables,
        "images": images,
        "warnings": warnings,
    }

    extraction_path = out_dir / "extraction.json"
    extraction_path.write_text(json.dumps(extraction, ensure_ascii=False, indent=2), encoding="utf-8")

    source_txt = []
    for page in pages:
        source_txt.append(f"\n\n===== PAGE {page['page']} =====\n\n{page['text']}")
    (out_dir / "source.txt").write_text("".join(source_txt).strip(), encoding="utf-8")

    summary = {
        "ok": True,
        "out": str(extraction_path),
        "pages": page_count,
        "chars": sum(page["chars"] for page in pages),
        "headings": len(headings),
        "tables": len(tables),
        "images": len(images),
        "ocrPages": ocr_pages,
        "warnings": len(warnings),
        "title": title,
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
