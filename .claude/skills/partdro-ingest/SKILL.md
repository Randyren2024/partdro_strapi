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
# add --post to write to Strapi, --publish to also publish
# stop early: --skip-ai (extraction only), --skip-extract (source is an extraction.json)
```

Useful flags: `--model`, `--max-chars` (30000), `--retries` (2), `--publish` requires `--post`.

Re-running the same source is safe: the slug is looked up first and an existing document is `PUT` instead of duplicated. Uploaded media with the same filename is reused.

## Pipeline stages

| Stage | Script | Output |
|-------|--------|--------|
| 1. Extract | `pdf_extract.py` / `url_extract.py` | `extraction.json` + `images/` |
| 2. AI | `ai_extract.py` | `product.json` |
| 3. Publish | `ingest.py` (`_attach_images`, `_post_to_strapi`) | `strapi_response.json` |

Output dir defaults to a temp dir; pass `--out` to keep artifacts. The API route keeps `outDir` only when the run succeeded **without** `--post`.

### 1. Extraction

`pdf_extract.py PDF_PATH --out OUT_DIR [--ocr auto|always|never] [--min-width 240] [--min-height 160] [--min-bytes 12000] [--max-images 80]`. It records text, headings, tables, and per-image metadata (`file`, `width`, `height`, `bytes`, `page`, `bbox`, `pages`, `duplicate`).

`url_extract.py URL --out OUT_DIR [--max-images 80]` produces the same schema.

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
2. `strapi_response.json` shows a real `id` / `documentId`; when publishing, `publishedAt` is non-null.
3. Open `http://localhost:3000/products/SLUG`: hero and section images render, no broken thumbnails, no full-page scans used as photos.
4. Spot-check semantics, not just aspect ratio — spec screenshots and diagrams can win a photo slot. Describe candidates with `bl vision describe --image IMAGE_PATH --prompt "what is in this image?" --output json --quiet` and rebind manually when wrong.

## Troubleshooting

- **400 `Invalid key __component at sections`** — each dynamic-zone entry must have `__component` as its first key.
- **Broken thumbnails in Strapi admin only** — admin CSP blocks external media. Keep the Supabase origin in [middlewares.ts](file:///c:/Users/81102/Desktop/partdro/cms/config/middlewares.ts), then restart Strapi.
- **403 on POST** — read-only token. Use the Full Access token.
- **Empty progress in UI** — Python buffering; the route already sets `PYTHONUNBUFFERED=1`.
- **Strapi timeout / slow PUT** — Supabase pooler can take ~30s; the client allows 180s.
- **404 on media files** — confirm the Supabase bucket is public and the upload provider env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`) is set.

Deeper Strapi 5 details: [references/strapi-pitfalls.md](references/strapi-pitfalls.md).