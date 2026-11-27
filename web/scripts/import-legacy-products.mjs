// Import legacy_partdro products (legacy Supabase) into THIS project's Strapi.
// Uploads images to this project's Supabase Storage via Strapi's /api/upload,
// then creates/updates the product (en + de/es/fr), idempotent by slug.
//
// Usage:
//   node web/scripts/import-legacy-products.mjs            # all products
//   node web/scripts/import-legacy-products.mjs --only d15r
//   node web/scripts/import-legacy-products.mjs --dry-run  # build payloads, no writes
//
// Requires Strapi running on :1337 and NUXT_STRAPI_FULL_TOKEN in web/.env.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const STRAPI = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '')
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const TOKEN = process.argv.find((a) => a.startsWith('eyJ')) || env.match(/^NUXT_STRAPI_FULL_TOKEN=(.+)$/m)?.[1]?.trim()
if (!TOKEN) { console.error('Missing NUXT_STRAPI_FULL_TOKEN'); process.exit(1) }

const LEGACY_SUPA = 'https://npxpxlosubxgkgsbyfnv.supabase.co'
const LEGACY_SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5weHB4bG9zdWJ4Z2tnc2J5Zm52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDQ2MTI3OCwiZXhwIjoyMTEwMDM3Mjc4fQ.sc4W9rnnCTYxPwyqHNqqPl49Q2vA5t9YejEDcy8Lxvk'
const LEGACY_PUBLIC = 'C:/Users/81102/Desktop/legacy_partdro/partdro/public'
const LEGACY_LIVE = 'https://www.droneworld.tech'

const CAT = { agricultural: 'agriculture', cargo: 'delivery-logistics', cleaning: 'other', EVTOL: 'other' }
const LOCALES = ['en', 'de', 'es', 'fr']
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null
const DRY = process.argv.includes('--dry-run')

const code = (slug) => 'PD-' + slug.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()

// Node fetch can't reach external hosts behind the proxy here; use curl for legacy.
function legacySupa(path) {
  const out = execFileSync('curl.exe', ['-s', `${LEGACY_SUPA}/rest/v1/${path}`, '-H', `apikey: ${LEGACY_SVC}`, '-H', `Authorization: Bearer ${LEGACY_SVC}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(out)
}

async function strapi(path, method = 'GET', body) {
  const r = await fetch(`${STRAPI}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Strapi ${r.status} ${method} ${path}: ${text.slice(0, 300)}`)
  return r.status === 204 ? null : JSON.parse(text)
}

// Upload one legacy image to Strapi media (Supabase Storage) -> media id.
// Reads the local file; if missing (gitignored), downloads from the legacy live site.
async function upload(imgPath) {
  const localPath = `${LEGACY_PUBLIC}${imgPath}`
  let bytes
  try {
    bytes = readFileSync(localPath)
  } catch {
    const res = await fetch(`${LEGACY_LIVE}${imgPath}`)
    if (!res.ok) throw new Error(`download ${res.status} ${imgPath}`)
    bytes = Buffer.from(await res.arrayBuffer())
  }
  const form = new FormData()
  form.append('files', new Blob([bytes]), imgPath.split('/').pop())
  const r = await fetch(`${STRAPI}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form })
  const text = await r.text()
  if (!r.ok) throw new Error(`upload ${r.status} ${imgPath}: ${text.slice(0, 200)}`)
  const arr = JSON.parse(text)
  return arr?.[0]?.id ?? null
}

function buildSections(p, heroId, galleryIds) {
  const sections = []
  const specs = p.specs && typeof p.specs === 'object' ? Object.entries(p.specs) : []
  if (specs.length) {
    sections.push({ __component: 'sections.specifications', title: 'Specifications', rows: specs.map(([label, value]) => ({ label, value: String(value) })) })
  }
  if (Array.isArray(p.features) && p.features.length) {
    sections.push({ __component: 'sections.feature-block', title: 'Key Features', items: p.features.map((f) => ({ title: f.title, description: f.description || '' })) })
  }
  galleryIds.forEach((id, i) => {
    sections.push({ __component: 'sections.showcase', title: 'Gallery', media: id, caption: `Image ${i + 1}` })
  })
  return sections
}

async function main() {
  const rows = legacySupa('products?select=id,slug,category,image_url,gallery,specs,features,sort_order,product_langs(lang,name,description,short_desc)&published=eq.true&order=sort_order.asc')
  const list = ONLY ? rows.filter((r) => r.slug === ONLY) : rows
  console.log(`Importing ${list.length} product(s)${ONLY ? ' (only ' + ONLY + ')' : ''}${DRY ? ' [dry-run]' : ''}`)

  let ok = 0
  for (const p of list) {
    const langs = Object.fromEntries((p.product_langs || []).map((l) => [l.lang, l]))
    const en = langs.en || {}
    try {
      // Media (skip in dry-run)
      let heroId = null
      const galleryIds = []
      if (!DRY) {
        if (p.image_url) heroId = await upload(p.image_url)
        for (const g of p.gallery || []) {
          const id = await upload(g)
          if (id) galleryIds.push(id)
        }
      }
      const sections = buildSections(p, heroId, galleryIds)
      const base = {
        slug: p.slug,
        code: code(p.slug),
        category: CAT[p.category] || 'other',
        ...(heroId ? { heroImage: heroId } : {}),
        sections,
      }
      const text = (l) => ({ name: l.name || p.slug, tagline: l.short_desc || '', subtitle: l.description || '' })

      if (DRY) {
        console.log(`  [dry] ${p.slug} hero=${p.image_url} gallery=${(p.gallery || []).length} specs=${Object.keys(p.specs || {}).length} features=${(p.features || []).length} langs=${Object.keys(langs).join(',')}`)
        ok++
        continue
      }

      // Find existing by slug (draft or published)
      let existing = null
      try {
        const found = await strapi(`/api/products?filters[slug][$eq]=${encodeURIComponent(p.slug)}&status=draft`)
        existing = found.data?.[0] || null
      } catch {}

      let documentId
      if (existing) {
        await strapi(`/api/products/${existing.documentId}?status=published`, 'PUT', { data: { ...base, ...text(en) } })
        documentId = existing.documentId
        console.log(`  PUT  ${p.slug}`)
      } else {
        const created = await strapi(`/api/products?status=published`, 'POST', { data: { ...base, ...text(en) } })
        documentId = created.data?.documentId
        console.log(`  POST ${p.slug}`)
      }

      // Translations (de/es/fr) — required shared fields + localized text + sections.
      for (const loc of ['de', 'es', 'fr']) {
        const l = langs[loc]
        if (!l) continue
        const payload = { slug: p.slug, code: code(p.slug), category: CAT[p.category] || 'other', ...text(l), sections }
        try {
          await strapi(`/api/products/${documentId}?locale=${loc}&status=published`, 'PUT', { data: payload })
        } catch (e1) {
          console.warn(`     ${loc} translation failed: ${e1.message}`)
        }
      }
      ok++
    } catch (e) {
      console.error(`  FAIL ${p.slug}: ${e.message}`)
    }
  }
  console.log(`\nDone: ${ok}/${list.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })