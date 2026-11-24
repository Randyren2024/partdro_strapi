# Strapi 5 pitfalls for Partdro ingest

## Dynamic zone key order

Strapi 5 validates the shape of dynamic-zone entries strictly. `__component` must be the **first** key of each entry, otherwise the request fails with:

```
400 Invalid key __component at sections
```

Fix by rebuilding each entry as `{"__component": ..., **rest}` before POST/PUT. This matters most for manual repair scripts that reorder or merge dicts.

## Updating an existing product

Never send read-only fields back. When doing a manual `PUT /api/products/<documentId>`, strip `id`, `documentId`, `createdAt`, `updatedAt`, `publishedAt`, `locale` from the payload and re-add only what should change. Publishing is done with a separate PUT:

```json
{ "data": { "publishedAt": "2020-01-01T00:00:00.000Z" } }
```

`ingest.py` handles this already; only manual scripts need care.

## populate syntax

For reading nested media, do not mix `[populate]=*` with nested populate on the same component. Use explicit paths:

```
?populate[heroImage]=true
&populate[sections][populate][image]=true
&populate[sections][populate][items][populate]=*
```

Mixing `*` and nested populate for the same component returns partial data or errors.

## Media stored in Supabase

Uploads go to Supabase Storage via `strapi-provider-upload-supabase`. Two consequences:

1. The site frontend loads images from another origin — no CSP problem there.
2. The Strapi admin panel defaults to `img-src 'self' data: blob: market-assets.strapi.io`, so every thumbnail breaks. `config/middlewares.ts` must widen `img-src`/`media-src` to `'self' data: blob: https://*.supabase.co` plus the origin derived from `SUPABASE_URL`. Restart Strapi after changing it and confirm the `content-security-policy` response header.

Diagnose with HTTP: if `HEAD` on the media URL returns 200 but the admin thumbnail is broken, it is CSP, not a missing file.

## Media reuse

`ingest.py` looks up `/api/upload/files?filters[name][$eq]=<filename>` before uploading, so repeated runs do not create duplicate media records. Renaming a source image creates a new record.

## Components used by the product type

| Component | Fields |
|-----------|--------|
| `sections.overview` | `title` (required), `body`, `image`, `stats` |
| `sections.feature-block` | `eyebrow`, `title` (required), `description`, `image`, `items` |
| `sections.applications` | `title` (required), `description`, `items` — no main image |
| `sections.endurance` | media field `image` |
| `sections.showcase` | media field `media` |

Schemas: [cms/src/components/sections](file:///c:/Users/81102/Desktop/partdro/cms/src/components/sections).