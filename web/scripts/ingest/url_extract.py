#!/usr/bin/env python3
"""Fetch a product URL and extract text, headings, tables and images.

Outputs the same `extraction.json` schema as pdf_extract.py so the AI extractor
can consume a single format regardless of source.

Usage:
    python url_extract.py <url> --out <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

IMG_EXTS = {"png", "jpg", "jpeg", "webp", "gif", "svg"}
MIN_IMAGE_BYTES = 12000


def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_text(value: str) -> str:
    value = value.replace("\u00ad", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def fetch_html(url: str, timeout: int = 30) -> tuple[str, str, dict]:
    """Return (final_url, html_text, response_headers)."""
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "")
    if "charset" not in content_type.lower():
        resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.url, resp.text, dict(resp.headers)


def extract_headings(soup: BeautifulSoup) -> list[dict]:
    headings: list[dict] = []
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        text = clean_text(tag.get_text())
        if not text or len(text) > 200:
            continue
        level = int(tag.name[1])
        headings.append({"text": text, "level": level})
    return headings


def extract_tables(soup: BeautifulSoup) -> list[dict]:
    tables: list[dict] = []
    for index, tag in enumerate(soup.find_all("table")):
        rows: list[list[str]] = []
        for tr in tag.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            row = [clean_text(c.get_text(" ", strip=True)) for c in cells]
            if any(row):
                rows.append(row)
        if len(rows) < 2:
            continue
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        markdown = "\n".join("| " + " | ".join(r) + " |" for r in rows)
        tables.append({"index": index, "rows": rows, "markdown": markdown})
    return tables


def _absolute_img_url(src: str, base: str) -> str | None:
    if not src or src.startswith("data:") or src.startswith("blob:"):
        return None
    try:
        url = urljoin(base, src)
    except ValueError:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return None
    return url


def extract_images(
    soup: BeautifulSoup,
    base_url: str,
    out_dir: Path,
    max_images: int = 80,
    seen: dict[str, dict] | None = None,
) -> list[dict]:
    if seen is None:
        seen = {}
    images: list[dict] = []
    for tag in soup.find_all("img"):
        src = tag.get("src") or tag.get("data-src") or tag.get("data-lazy-src") or ""
        url = _absolute_img_url(src, base_url)
        if not url:
            continue
        filename = Path(urlparse(url).path).name
        ext = Path(filename).suffix.lstrip(".").lower() or "jpg"
        if ext not in IMG_EXTS:
            ext = "jpg"
        try:
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
            resp.raise_for_status()
            data = resp.content
        except Exception:
            continue
        if len(data) < MIN_IMAGE_BYTES:
            continue
        digest = sha256_bytes(data)
        if digest in seen:
            continue
        if len(seen) >= max_images:
            break
        image_id = f"img{len(seen) + 1}-{digest[:8]}"
        safe_filename = f"{image_id}.{ext}"
        (out_dir / safe_filename).write_bytes(data)
        alt = tag.get("alt", "") or ""
        entry = {
            "id": image_id,
            "file": safe_filename,
            "url": url,
            "alt": alt[:200],
            "bytes": len(data),
            "sha256": digest,
            "width": None,
            "height": None,
            "caption": None,
            "duplicate": False,
        }
        seen[digest] = entry
        images.append(entry)
    return images


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="URL of the product page")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--max-images", type=int, default=80)
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    try:
        final_url, html, headers = fetch_html(args.url)
    except requests.RequestException as exc:
        print(json.dumps({"ok": False, "error": f"Failed to fetch: {exc}"}), file=sys.stderr)
        return 2

    soup = BeautifulSoup(html, "lxml")

    # Remove boilerplate tags that aren't product content.
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "nav", "footer"]):
        tag.decompose()

    headings = extract_headings(soup)
    tables = extract_tables(soup)
    images = extract_images(soup, final_url, images_dir, args.max_images)
    seen = {img["sha256"]: img for img in images}

    raw_text = clean_text(soup.get_text("\n", strip=True))
    title_tag = soup.find("title")
    title = clean_text(title_tag.get_text()) if title_tag else ""

    og_desc = soup.find("meta", attrs={"property": "og:description"})
    meta_desc = ""
    if og_desc and og_desc.get("content"):
        meta_desc = og_desc["content"].strip()
    else:
        desc_tag = soup.find("meta", attrs={"name": "description"})
        if desc_tag and desc_tag.get("content"):
            meta_desc = desc_tag["content"].strip()

    # Pages is a single synthetic page (web pages don't map to PDF pages).
    pages = [
        {
            "page": 1,
            "width": None,
            "height": None,
            "text": raw_text,
            "chars": len(raw_text),
            "headings": headings,
            "tables": len(tables),
            "ocr": False,
        }
    ]

    extraction = {
        "source": {
            "type": "url",
            "url": args.url,
            "finalUrl": final_url,
            "title": title,
            "description": meta_desc,
            "bytes": len(html.encode("utf-8")),
            "sha256": sha256_bytes(html.encode("utf-8")),
            "headers": {k: v for k, v in headers.items() if k.lower() in {"content-type", "server", "last-modified"}},
        },
        "pages": pages,
        "headings": headings,
        "tables": tables,
        "images": images,
        "warnings": [],
    }

    extraction_path = out_dir / "extraction.json"
    extraction_path.write_text(json.dumps(extraction, ensure_ascii=False, indent=2), encoding="utf-8")

    (out_dir / "source.txt").write_text(raw_text, encoding="utf-8")

    summary = {
        "ok": True,
        "out": str(extraction_path),
        "finalUrl": final_url,
        "chars": len(raw_text),
        "headings": len(headings),
        "tables": len(tables),
        "images": len(images),
        "title": title,
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
