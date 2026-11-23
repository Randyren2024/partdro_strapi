#!/usr/bin/env python3
"""End-to-end ingestion orchestrator for Partdro.

    ingest.py <source> [--post] [--publish] [--out <dir>]

<source> can be:
    * a local .pdf file path  → pdf_extract → ai_extract → [--post to Strapi]
    * an http(s) URL          → url_extract → ai_extract → [--post to Strapi]

Environment variables:
    STRAPI_URL           defaults to http://localhost:1337
    STRAPI_TOKEN         bearer token for Strapi (Full Access recommended)
    AI_API_KEY / AI_BASE_URL / AI_MODEL  → any OpenAI-compatible LLM
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlparse

import requests


HERE = Path(__file__).resolve().parent


def _run_pdf(pdf_path: Path, out_dir: Path) -> Path:
    """Run pdf_extract.py as a subprocess — keeps memory clean for large PDFs."""
    import subprocess

    script = HERE / "pdf_extract.py"
    result = subprocess.run(
        [sys.executable, str(script), str(pdf_path), "--out", str(out_dir)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"pdf_extract failed ({result.returncode}): {result.stderr[-500:]}")
    print("   ", result.stdout.strip())
    return out_dir / "extraction.json"


def _run_url(url: str, out_dir: Path) -> Path:
    """Run url_extract.py as a subprocess."""
    import subprocess

    script = HERE / "url_extract.py"
    result = subprocess.run(
        [sys.executable, str(script), url, "--out", str(out_dir)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"url_extract failed ({result.returncode}): {result.stderr[-500:]}")
    print("   ", result.stdout.strip())
    return out_dir / "extraction.json"


def _run_ai(extraction_json: Path, product_json: Path, model: str | None, max_chars: int, retries: int) -> None:
    import subprocess

    script = HERE / "ai_extract.py"
    cmd = [
        sys.executable,
        str(script),
        str(extraction_json),
        "--out",
        str(product_json),
        "--max-chars",
        str(max_chars),
        "--retries",
        str(retries),
    ]
    if model:
        cmd += ["--model", model]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"ai_extract failed ({result.returncode}): {result.stderr[-800:]}")
    print("   ", result.stdout.strip())


def _strip_media_fields(payload: dict) -> dict:
    """Drop LLM-generated media placeholders before we attach real file ids."""
    def walk(node):
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items() if k not in {"image", "heroImage", "media"}}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node
    return walk(payload)


# ---- Images → Strapi /api/upload → Supabase Storage ----------------------

MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# Which dynamic-zone component owns which media field.
SECTION_IMAGE_FIELD = {
    "sections.overview": "image",
    "sections.feature-block": "image",
    "sections.endurance": "image",
    "sections.showcase": "media",
}
ITEM_IMAGE_PARENTS = {"sections.feature-block", "sections.applications"}

# Preferred width/height ratio of each image slot in the site layout.
# Images are assigned by aspect closeness so landscape photos don't get
# crushed into portrait frames (and vice versa).
SECTION_TARGET_ASPECT = {
    "sections.overview": 0.8,      # half-column figure, natural height
    "sections.feature-block": 1.6, # full-column banner
    "sections.endurance": 1.35,
    "sections.showcase": 1.78,
}
ITEM_TARGET_ASPECT = 1.6  # 16:10 card thumbnails


def _page_area(extraction: dict) -> float:
    """Page area in points, used to spot full-page artwork."""
    for page in extraction.get("pages") or []:
        try:
            width = float(page.get("width") or 0)
            height = float(page.get("height") or 0)
        except (TypeError, ValueError):
            continue
        if width and height:
            return width * height
    return 0.0


def _is_page_art(img: dict, page_area: float) -> bool:
    """Full-page artwork (background texture or whole-page scan).

    Those images carry the page layout — including baked-in copy — so they
    look wrong as hero/section photos and are cropped beyond recognition in
    the site's landscape frames.
    """
    if len(img.get("pages") or []) >= 3:
        return True
    bbox = img.get("bbox") or []
    if page_area and len(bbox) == 4:
        try:
            covered = (float(bbox[2]) - float(bbox[0])) * (float(bbox[3]) - float(bbox[1]))
        except (TypeError, ValueError):
            return False
        if covered / page_area >= 0.9:
            return True
    return False


def _select_images(extraction: dict, images_dir: Path, limit: int = 12) -> list[dict]:
    """Pick real product photos from the extraction manifest, hero first.

    Filters out icons, logos, thin banners, full-page artwork and duplicates
    using the metadata recorded by pdf_extract.py.
    """
    picked: list[dict] = []
    seen: set[str] = set()
    page_area = _page_area(extraction)
    for img in extraction.get("images") or []:
        name = img.get("file")
        if not name or name in seen or img.get("duplicate"):
            continue
        path = images_dir / name
        if not path.is_file():
            continue
        width = int(img.get("width") or 0)
        height = int(img.get("height") or 0)
        size = int(img.get("bytes") or 0)
        if not height:
            continue
        aspect = width / height
        if width < 500 or height < 320 or size < 35000 or not (0.45 <= aspect <= 3.4):
            continue
        if _is_page_art(img, page_area):
            continue
        seen.add(name)
        picked.append({**img, "path": path, "area": width * height, "aspect": aspect})
    if not picked:
        return []
    picked.sort(key=lambda x: (int(x.get("page") or 0), -x["area"]))
    # Hero: a wide, high-resolution shot that fills the full-bleed banner.
    wide = [
        i for i in picked
        if i["aspect"] >= 1.5 and int(i.get("width") or 0) >= 1200
    ]
    hero = max(wide or picked, key=lambda x: x["area"])
    return [hero] + [i for i in picked if i is not hero][: max(0, limit - 1)]


def _find_upload(strapi_url: str, token: str, filename: str, timeout: int) -> int | None:
    """Reuse an already-uploaded file so re-runs don't duplicate media records."""
    try:
        resp = requests.get(
            f"{strapi_url}/api/upload/files",
            params={
                "filters[name][$eq]": filename,
                "fields[0]": "name",
                "pagination[pageSize]": "1",
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
        if resp.status_code == 200:
            rows = resp.json()
            if isinstance(rows, dict):
                rows = rows.get("data") or []
            if rows:
                return rows[0].get("id")
    except Exception:
        pass
    return None


def _upload_image(strapi_url: str, token: str, item: dict, timeout: int) -> int | None:
    filename = item["file"]
    existing = _find_upload(strapi_url, token, filename, timeout)
    if existing:
        print(f"   · reuse media {filename} (id={existing})")
        return existing
    mime = MIME_BY_EXT.get(Path(filename).suffix.lower(), "application/octet-stream")
    with item["path"].open("rb") as fh:
        resp = requests.post(
            f"{strapi_url}/api/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"files": (filename, fh, mime)},
            timeout=timeout,
        )
    if resp.status_code not in {200, 201}:
        print(f"   ✗ upload {filename} failed {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
        return None
    rows = resp.json()
    if isinstance(rows, dict):
        rows = rows.get("data") or []
    if not rows:
        print(f"   ✗ upload {filename} returned no file record", file=sys.stderr)
        return None
    print(f"   ✓ uploaded media {filename} (id={rows[0].get('id')})")
    return rows[0].get("id")


def _attach_images(
    payload: dict,
    extraction: dict,
    images_dir: Path,
    strapi_url: str,
    token: str,
) -> int:
    """Upload extracted images and bind them to heroImage / section media fields."""
    images = _select_images(extraction, images_dir)
    if not images:
        print("   (no usable images found in extraction)", file=sys.stderr)
        return 0

    pool: list[dict] = []
    for item in images:
        file_id = _upload_image(strapi_url, token, item, timeout=180)
        if file_id and all(e["id"] != file_id for e in pool):
            pool.append({"id": file_id, "aspect": item["aspect"], "area": item["area"]})
        if len(pool) >= 12:
            break
    if not pool:
        return 0

    used: set[int] = set()

    def take(target: float) -> int | None:
        """Closest unused image to the slot's target aspect ratio."""
        candidates = [e for e in pool if e["id"] not in used]
        if not candidates:
            return None
        best = min(
            candidates,
            key=lambda e: (abs(math.log(e["aspect"] / target)), -e["area"]),
        )
        used.add(best["id"])
        return best["id"]

    hero = pool[0]["id"]
    used.add(hero)
    payload["heroImage"] = hero

    for section in payload.get("sections") or []:
        component = section.get("__component")
        field = SECTION_IMAGE_FIELD.get(component)
        if field:
            file_id = take(SECTION_TARGET_ASPECT.get(component, 1.6))
            if file_id:
                section[field] = file_id
        if component in ITEM_IMAGE_PARENTS:
            for entry in section.get("items") or []:
                file_id = take(ITEM_TARGET_ASPECT)
                if not file_id:
                    break
                entry["image"] = file_id
    return len(pool)


def _post_to_strapi(
    payload: dict,
    publish: bool,
    extraction: dict | None = None,
    images_dir: Path | None = None,
) -> dict:
    """Create or update the product, then optionally publish it.

    Creates on first run; if the slug already exists it updates that document
    instead, so re-running the same source is idempotent.
    """
    strapi_url = os.environ.get("STRAPI_URL", "http://localhost:1337").rstrip("/")
    token = os.environ.get("STRAPI_TOKEN", "")
    if not token:
        # also accept the .env-style vars from the Nuxt web app
        token = os.environ.get("NUXT_STRAPI_FULL_TOKEN") or os.environ.get("NUXT_STRAPI_TOKEN", "")
    if not token:
        raise RuntimeError(
            "STRAPI_TOKEN not set. Create one in Strapi Admin → Settings → API Tokens "
            "(Full Access) and export STRAPI_TOKEN=..."
        )

    payload = _strip_media_fields(payload)
    if extraction is not None and images_dir is not None:
        print("   uploading images → Strapi upload → Supabase Storage")
        count = _attach_images(payload, extraction, images_dir, strapi_url, token)
        print(f"   ✓ {count} image(s) attached (heroImage + section media)")

    url = f"{strapi_url}/api/products"
    body = {"data": payload}
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    # Supabase pooler round-trips can take ~30s; allow generous headroom.
    timeout = 180

    slug = body["data"].get("slug")
    existing_id = None
    if slug:
        found = requests.get(
            url,
            params={"filters[slug][$eq]": slug, "status": "draft", "fields[0]": "slug"},
            headers=headers,
            timeout=timeout,
        )
        if found.status_code == 200:
            rows = found.json().get("data") or []
            if rows:
                existing_id = rows[0].get("documentId")

    if existing_id:
        print(f"   PUT {url}/{existing_id}  (slug exists, updating)")
        resp = requests.put(f"{url}/{existing_id}", json=body, headers=headers, timeout=timeout)
    else:
        print(f"   POST {url}")
        resp = requests.post(url, json=body, headers=headers, timeout=timeout)

    if resp.status_code in {200, 201}:
        doc = resp.json().get("data", {})
        doc_id = doc.get("id")
        print(f"   ✓ Strapi id={doc_id}  published={doc.get('publishedAt') is not None}")

        if publish and doc_id and doc.get("publishedAt") is None:
            pub = requests.put(
                f"{url}/{doc.get('documentId') or doc_id}",
                json={"data": {"publishedAt": "2020-01-01T00:00:00.000Z"}},  # any non-null ISO date → publish
                headers=headers,
                timeout=timeout,
            )
            if pub.status_code in {200, 201}:
                print(f"   ✓ Published")
            else:
                print(f"   ✗ Publish failed {pub.status_code}: {pub.text[:300]}", file=sys.stderr)

        return {"strapi_id": doc_id, "documentId": doc.get("documentId"), "attributes": doc}

    print(f"   ✗ Strapi {resp.status_code}: {resp.text[:600]}", file=sys.stderr)
    resp.raise_for_status()
    return {}


def _is_url(source: str) -> bool:
    try:
        parsed = urlparse(source)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="End-to-end: PDF/URL → extraction → AI → Strapi Product"
    )
    parser.add_argument("source", help="PDF path or http(s) URL")
    parser.add_argument("--out", default=None, help="Output directory (default: ./ingest_out/<slug-or-name>)")
    parser.add_argument("--model", default=None, help="Override AI_MODEL")
    parser.add_argument("--max-chars", type=int, default=30000, help="Max chars sent to LLM")
    parser.add_argument("--retries", type=int, default=2, help="LLM retries")
    parser.add_argument("--post", action="store_true", help="POST the result to Strapi")
    parser.add_argument("--publish", action="store_true", help="Also publish in Strapi (requires --post)")
    parser.add_argument("--skip-ai", action="store_true", help="Stop after extraction, no LLM call")
    parser.add_argument("--skip-extract", action="store_true", help="Source is already an extraction.json")
    args = parser.parse_args()

    extraction_path: Path | None = None
    product_path: Path | None = None

    try:
        if args.skip_extract:
            extraction_path = Path(args.source).resolve()
            if not extraction_path.is_file():
                print(f"Extraction not found: {extraction_path}", file=sys.stderr)
                return 2
            out_dir = extraction_path.parent
        elif _is_url(args.source):
            out_dir = Path(args.out).resolve() if args.out else Path(tempfile.mkdtemp(prefix="ingest-url-"))
            out_dir.mkdir(parents=True, exist_ok=True)
            print(f"[1/3] URL extract → {out_dir}")
            extraction_path = _run_url(args.source, out_dir)
        else:
            pdf_path = Path(args.source).resolve()
            if not pdf_path.is_file():
                print(f"PDF not found: {pdf_path}", file=sys.stderr)
                return 2
            out_dir = Path(args.out).resolve() if args.out else Path(tempfile.mkdtemp(prefix="ingest-pdf-"))
            out_dir.mkdir(parents=True, exist_ok=True)
            print(f"[1/3] PDF extract → {out_dir}")
            extraction_path = _run_pdf(pdf_path, out_dir)

        assert extraction_path is not None
        print(f"[2/3] AI extract → product.json")
        product_path = out_dir / "product.json"
        if args.skip_ai:
            print("   (--skip-ai requested, stopping at extraction)")
        else:
            _run_ai(extraction_path, product_path, args.model, args.max_chars, args.retries)

        if args.post:
            assert product_path is not None and product_path.is_file()
            print(f"[3/3] POST to Strapi")
            payload = json.loads(product_path.read_text(encoding="utf-8"))
            extraction = json.loads(extraction_path.read_text(encoding="utf-8"))
            info = _post_to_strapi(
                payload,
                args.publish,
                extraction=extraction,
                images_dir=out_dir / "images",
            )
            # Write Strapi response alongside product.json for debugging.
            (out_dir / "strapi_response.json").write_text(json.dumps(info, ensure_ascii=False, indent=2))
        elif args.publish:
            print("   (--publish ignored without --post)", file=sys.stderr)

        print(json.dumps({"ok": True, "out": str(out_dir), "extraction": str(extraction_path), "product": str(product_path) if product_path and product_path.is_file() else None}))
        return 0

    except Exception as exc:
        traceback.print_exc()
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
