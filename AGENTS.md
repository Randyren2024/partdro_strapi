# AGENTS.md

Partdro product site: Strapi 5 CMS + Nuxt 4 storefront + Python PDF/URL → LLM ingest.
Three independent trees; there is no root `package.json`. Run Node commands inside `cms/` or `web/`.

## Run and verify

```powershell
cd cms; npm run develop      # Strapi + admin on :1337 (needs Supabase env)
cd web; npm run dev          # Nuxt storefront/BFF on :3000
python web/scripts/ingest/ingest.py <pdf-or-url> --out .tmp/ingest/<slug>
```

No test, lint, typecheck, or CI scripts exist. Verify with:

- `cd web; npm run build`
- `cd cms; npm run build` (also validates content-type schemas)
- `python -m compileall -q web/scripts/ingest`
- Live checks: `GET /api/products`, `GET /api/products/<slug>`, and `/ingest`.

Node 24 is used here; `cms` engines allow 22–26.

## Topology

- `cms/` — Strapi 5.63, owns the Product content type and all database migrations. Postgres is the linked Supabase project. Media goes to Supabase Storage through the local provider `file:./src/providers/upload-supabase`, not `cms/public/uploads`.
- `web/` — Nuxt 4. Strapi is reached only through the BFF (`server/utils/strapi.ts`, `server/api/*`); browser code never sees Strapi tokens. `/ingest` is the AI import UI; `server/api/ingest.post.ts` spawns Python and streams NDJSON.
- `web/scripts/ingest/` — the pipeline: `pdf_extract.py` / `url_extract.py` → `ai_extract.py` → `ingest.py` (media + Strapi).
- `supabase/` — only CLI config/link state; there are no migrations here. The linked database is live Strapi data: never run `supabase db reset` or remote migrations against it.
- Root `README.md` is a stub. The real ingest contract is `.opencode/skills/partdro-ingest/SKILL.md` plus its `references/strapi-pitfalls.md`.

## Ingest rules

- Configure AI through `/ingest` (writes `web/scripts/ingest/ai_config.json`, plaintext and gitignored) or env `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`; env wins. `DEEPSEEK_API_KEY` in `cms/.env` is not read by the pipeline.
- Strapi writes need `NUXT_STRAPI_FULL_TOKEN` (server-only) or `STRAPI_TOKEN`. `NUXT_STRAPI_TOKEN` is read-only and gets 403 on POST.
- Dynamic-zone entries must put `__component` first; never emit empty lists or title-only sections. Manual PUTs must strip read-only fields.
- `ai_extract.py` truncates source at `--max-chars` (default 30,000). Long PDFs silently lose later pages/specs; raise it deliberately.
- Media is deterministic: `ingest.py` `_select_images` filters and uploads at most 12 images, then assigns hero/section slots by aspect. LLM-provided media fields are stripped. Re-runs reuse uploaded files by filename.
- Re-running a slug updates the existing draft (lookup uses `status=draft`); publishing is a separate PUT setting `publishedAt`.
- `/api/ingest` and `/ingest` are unauthenticated and spawn Python / fetch arbitrary URLs (80 MB, 600 s). Do not expose publicly without auth or an allowlist.
- Output defaults to a temp directory; the API deletes it after a successful `--post`. Pass `--out` to keep `extraction.json`, `product.json`, and images for debugging.

## Rendering and schema

- Product schema: `cms/src/api/product/content-types/product/schema.json`; section components: `cms/src/components/sections/*.json`.
- Adding a section requires all four: Strapi component, Vue component in `web/app/components/`, `sectionMap` in `web/app/pages/products/[slug].vue`, and `productPopulate` in `web/server/utils/strapi.ts`. A missing map/populate silently drops the section.
- The public BFF fetches published entries only; drafts are not previewable on the site. Keep the Full Access token server-side.
- Images are absolute Supabase Storage URLs. Strapi admin thumbnails break unless `cms/config/middlewares.ts` CSP allows the Supabase origin.

## Environment gotchas

- `cms/.env` must set `DATABASE_CLIENT=postgres`; `cms/config/database.ts` defaults to sqlite and would silently use `.tmp/data.db`.
- Use the Supabase session-pooler connection string. Its chain is self-signed, so the working config needs `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
- `cms/.env.example` is Strapi boilerplate and incomplete. Actual needs include DB + Strapi secrets, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.
- `web/.env`: `NUXT_PUBLIC_STRAPI_URL`, `NUXT_STRAPI_TOKEN` (read API), `NUXT_STRAPI_FULL_TOKEN` (write; read directly from `process.env`, not runtimeConfig).
- Install Python deps with `pip install -r web/scripts/ingest/requirements.txt`. The route calls `python`, not `python3`. OCR additionally needs Tesseract (`eng`, `chi_sim`); it is not in requirements.
- npm 11 only warns about unapproved install scripts; `cms/package.json` pins `allowScripts`. npm 12 will block them.
- `.claude/` and `.trae/` contain copies of the `partdro-ingest` skill. For OpenCode, edit `.opencode/skills/partdro-ingest/`; keep copies in sync if the workflow changes.