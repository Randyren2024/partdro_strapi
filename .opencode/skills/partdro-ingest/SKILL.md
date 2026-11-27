---
name: partdro-ingest
description: Turn a product PDF or URL into AI-written English content, uploaded media, and a published Strapi product through the Partdro ingest pipeline. Use when asked to ingest, import, or publish a product.
---

# Partdro Ingest

End-to-end pipeline: **PDF / URL → extraction.json → product.json → images → Strapi product**.

Scripts live in [web/scripts/ingest](file:///c:/Users/81102/Desktop/partdro/web/scripts/ingest). The Nuxt BFF entry is [ingest.post.ts](file:///c:/Users/81102/Desktop/partdro/web/server/api/ingest.post.ts); the UI is `/ingest`.

## Preconditions

1. Dependencies installed once:
   ```powershell
   pip install -r web/scripts/ingest/requirements.txt
   ```
2. AI provider configured — env wins over `web/scripts/ingest/ai_config.json`:
   `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (default DashScope `https://dashscope.aliyuncs.com/compatible-mode/v1`, model `deepseek-v4.1-flash-1017`).
   `ai_config.json` holds a plaintext key and is gitignored — never commit it.
3. Strapi reachable (`http://localhost:1337`) and media upload configured for Supabase Storage ([plugins.ts](file:///c:/Users/81102/Desktop/partdro/cms/config/plugins.ts)).
4. A **write** token: `STRAPI_TOKEN` or `NUXT_STRAPI_FULL_TOKEN` (Full Access). The read-only token returns 403 on POST.

## Path A — UI (normal case)

Open `http://localhost:3000/ingest` (start with `npm run dev` in `web/`), upload a PDF or paste a URL, tick **自动 POST** and **同时发布** as needed. The page streams NDJSON progress: `start → extract → ai → strapi → done`.

## Path B — CLI

```powershell
python web/scripts/ingest/ingest.py "PDF_PATH_OR_URL" --out .tmp/ingest/SLUG
# add --post to write a draft, --publish to also publish
# stop early: --skip-ai (extraction only), --skip-extract (source is an extraction.json)
# URL example:
python web/scripts/ingest/ingest.py "https://www.jouav.com/products/aq600.html" --out .tmp/ingest/aq600-url
```

Useful flags: `--model`, `--max-chars` (30000), `--retries` (2), `--publish` requires `--post`.

Publication state is always explicit: `--post` sends `?status=draft`, `--publish` sends `?status=published`. Strapi 5.63's REST API **publishes on create/update when no `status` param is present**, so never rely on the default. A `--post`-only run prints `published=False` and leaves `publishedAt` null.

Re-running the same source is safe: the slug is looked up first and an existing document is `PUT` instead of duplicated. Uploaded media with the same filename is reused.

## Pipeline stages

| Stage | Script | Output |
|-------|--------|--------|
| 1. Extract | `pdf_extract.py` / `url_extract.py` | `extraction.json` + `images/` |
| 2. AI | `ai_extract.py` | `product.json` |
| 3. Publish | `ingest.py` (`_attach_images`, `_post_to_strapi`) | `strapi_response.json` |

Output dir defaults to a temp dir; pass `--out` to keep artifacts. The API route keeps `outDir` only when the run succeeded **without** `--post`.

### 1. Extraction

**PDF** — `pdf_extract.py PDF_PATH --out OUT_DIR [--ocr auto|always|never] [--min-width 240] [--min-height 160] [--min-bytes 12000] [--max-images 80]`. Records text, headings, tables, and per-image metadata (`file`, `width`, `height`, `bytes`, `page`, `bbox`, `pages`, `duplicate`).

**URL** — `url_extract.py URL --out OUT_DIR [--max-images 80]`. Same schema; the page text lands in `pages[0].text`, with `source.finalUrl`, `source.title` and `source.description` on the root. The script prints `{chars, headings, tables, images, title}` — check it before paying for an AI call. Behaviour that matters:

- The page is fetched once with `requests`; **no JavaScript runs**. If the copy is hydrated by XHR, extraction returns navigation text only. A lower-grade but usable fallback is to save the rendered page as PDF and feed that to `pdf_extract.py`.
- Product photos are often lazy-loaded: `src` points at a placeholder (`imgbg.png`) while the real file sits in `data-src` / `data-original` / `data-lazy-src` / `data-url`. `_image_candidates` tries those attributes first and sorts placeholder markers last.
- Images download with `Referer: <final page URL>`; some CDNs (e.g. `img.wds168.cn`) return 403 to bare requests.
- Some WAFs drop a browser User-Agent coming from a non-browser TLS stack (`eauav.com` answers `RemoteDisconnected`). `fetch_html` retries once with `curl/8.4.0` and the image downloads reuse whichever UA got the page.
- `width` / `height` are measured with PyMuPDF after download, so `_select_images` can rank them. URL images have no `page` / `bbox`, so the full-page-artwork heuristic never applies to them.
- `MIN_IMAGE_BYTES` is 12 KB. Icon sprites and arrows still slip through, but `_select_images` drops them by pixel size (`width < 500`, `height < 320`).

Qualify the source before ingesting: `chars < 1500` or only sub-500 px images means the page is a catalog shell, not a datasheet. Example — `droneyee.com/Product/706527.html` prints `chars: 1141, images: 5` (110×110 thumbnails, detail lives in an AJAX tab), while `jouav.com/products/aq600.html` prints `chars: 5009, images: 10` and yields 6 sections. Prefer the vendor PDF or an English product page when both exist.

### 2. AI extraction

`ai_extract.py extraction.json --out product.json [--model] [--temperature 0.1] [--max-chars] [--retries]`.

Hard rule enforced in the prompt: **every human-readable string is natural professional English**, regardless of source language. Keep model codes/SKUs, units, and numbers verbatim. A repair pass fixes `null` list entries.

### 3. Images

`_select_images` filters metadata: drop duplicates, `width < 500`, `height < 320`, `bytes < 35000`, aspect outside `0.45–3.4`, and full-page artwork (`len(pages) >= 3` or bbox covering ≥ 90% of the page). Hero = widest high-res shot (`aspect >= 1.5`, `width >= 1200`) with the largest area.

Slots are filled by aspect closeness, `abs(log(aspect / target))`, tie-broken by larger area (`take()` in [ingest.py](file:///c:/Users/81102/Desktop/partdro/web/scripts/ingest/ingest.py#L283-L314)):

| Component | Field | Target aspect |
|-----------|-------|---------------|
| `sections.overview` | `image` | 0.8 |
| `sections.feature-block` | `image` | 1.6 |
| `sections.endurance` | `image` | 1.35 |
| `sections.showcase` | `media` | 1.78 |
| items of `feature-block` / `applications` | `image` | 1.6 |

`sections.applications` has **no** main image field. Up to 12 images are uploaded to `/api/upload`; existing filenames are reused.

## Verify before reporting success

1. `product.json` exists and `sections` is non-empty; all copy is English (no CJK).
2. `strapi_response.json` shows a real `id` / `documentId`; `--post` alone keeps `publishedAt` null, `--publish` sets it.
3. Open `http://localhost:3000/products/SLUG`: hero and section images render, no broken thumbnails, no full-page scans used as photos.
4. Spot-check semantics, not just aspect ratio — spec screenshots and diagrams can win a photo slot. Describe candidates with `bl vision describe --image IMAGE_PATH --prompt "what is in this image?" --output json --quiet` and rebind manually when wrong.

## Troubleshooting

- **URL returns nav-only text or 0 images** — the page is JS-rendered or gates assets behind AJAX. Check the printed `chars`/`images`; fall back to the vendor PDF, or save the rendered page as PDF and run `pdf_extract.py`. Hand-built `extraction.json` + `--skip-extract` also works.
- **URL images 403 / time out** — `url_extract.py` already sends the page as `Referer`; if the CDN still refuses, the source needs cookies/JS, so take the PDF route.
- **400 `Invalid key __component at sections`** — each dynamic-zone entry must have `__component` as its first key.
- **Broken thumbnails in Strapi admin only** — admin CSP blocks external media. Keep the Supabase origin in [middlewares.ts](file:///c:/Users/81102/Desktop/partdro/cms/config/middlewares.ts), then restart Strapi.
- **403 on POST** — read-only token. Use the Full Access token.
- **`--post` produced a live entry** — Strapi 5.63 publishes on write unless the request passes `?status=draft`. `ingest.py` now always sends the status; for older runs, `PUT /api/products/<documentId>?status=draft` only updates the draft version, so delete and re-run to get a real draft.
- **Empty progress in UI** — Python buffering; the route already sets `PYTHONUNBUFFERED=1`.
- **Strapi timeout / slow PUT** — Supabase pooler can take ~30s; the client allows 180s.
- **404 on media files** — confirm the Supabase bucket is public and the upload provider env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`) is set.

Deeper Strapi 5 details: [references/strapi-pitfalls.md](references/strapi-pitfalls.md).