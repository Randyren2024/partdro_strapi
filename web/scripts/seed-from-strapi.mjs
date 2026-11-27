// Deterministically build the web_snapshot from Strapi directly (bypasses the BFF,
// so it works even when the Nuxt dev server is flaky). The live site reads this.
//
// Usage: node web/scripts/seed-from-strapi.mjs [baseUrl]
// Requires Strapi on :1337 and NUXT_STRAPI_TOKEN + Supabase creds in web/.env.
import { readFileSync } from 'node:fs'

const STRAPI = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '')
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const TOKEN = env.match(/^NUXT_STRAPI_TOKEN=(.+)$/m)?.[1]?.trim()
const SB_URL = env.match(/^NUXT_SUPABASE_URL=(.+)$/m)?.[1]?.trim().replace(/\/$/, '')
const SB_KEY = env.match(/^NUXT_SUPABASE_SERVICE_KEY=(.+)$/m)?.[1]?.trim()
const LOCALES = ['en', 'de', 'es', 'fr']
const MEDIA = ['url', 'alternativeText', 'width', 'height']

// Bracket-serialize a nested query object (same as server/utils/strapi.ts).
function toQuery(params, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v == null) continue
    if (typeof v === 'boolean') out[key] = v ? 'true' : 'false'
    else if (Array.isArray(v)) v.forEach((x, i) => {
      if (x && typeof x === 'object') Object.assign(out, toQuery(x, `${key}[${i}]`))
      else out[`${key}[${i}]`] = String(x)
    })
    else if (typeof v === 'object') Object.assign(out, toQuery(v, key))
    else out[key] = String(v)
  }
  return out
}

async function strapi(path, query) {
  const u = new URL(STRAPI + path)
  for (const [k, v] of Object.entries(toQuery(query || {}))) u.searchParams.set(k, v)
  const r = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

async function write(key, payload) {
  const r = await fetch(`${SB_URL}/rest/v1/web_snapshot`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, payload, updated_at: new Date().toISOString() }),
  })
  if (!r.ok) throw new Error(`snapshot write ${r.status} ${key}`)
}

const productPopulate = {
  seo: { populate: { metaImage: { fields: MEDIA }, metaSocial: { populate: { image: { fields: MEDIA } } } } },
  heroImage: { fields: MEDIA },
  heroStats: true,
  quoteCta: true,
  sections: {
    on: {
      'sections.overview': { populate: { image: { fields: MEDIA }, stats: true } },
      'sections.feature-block': { populate: { image: { fields: MEDIA }, items: { populate: { image: { fields: MEDIA } } } } },
      'sections.endurance': { populate: { image: { fields: MEDIA }, points: true } },
      'sections.applications': { populate: { items: { populate: { image: { fields: MEDIA } } } } },
      'sections.showcase': { populate: { media: { fields: MEDIA } } },
      'sections.editions': true,
      'sections.specifications': { populate: { rows: true } },
      'sections.faq': { populate: { items: true } },
    },
  },
}
const listPopulate = {
  seo: { populate: { metaImage: { fields: MEDIA } } },
  heroImage: { fields: MEDIA },
}
const NEWS_FIELDS = ['slug', 'title', 'summary', 'category', 'publishedAt', 'updatedAt']
const newsListPopulate = {
  cover: { fields: MEDIA },
  seo: { populate: { metaImage: { fields: MEDIA } } },
}
const newsOnePopulate = {
  cover: { fields: MEDIA },
  seo: { populate: { metaImage: { fields: MEDIA }, metaSocial: { populate: { image: { fields: MEDIA } } } } },
}

const mapProductList = (p) => ({ slug: p.slug, code: p.code, name: p.name, tagline: p.tagline, subtitle: p.subtitle, category: p.category ?? null, heroImage: p.heroImage ?? null, seo: p.seo ?? null, updatedAt: p.updatedAt ?? null })
const mapNews = (p) => ({ slug: p.slug, title: p.title, summary: p.summary ?? '', category: p.category ?? '', publishedAt: p.publishedAt ?? null, updatedAt: p.updatedAt ?? null, cover: p.cover ?? null, seo: p.seo ?? null })

function dedupe(entries, limit) {
  const seen = new Set(); const out = []
  for (const e of entries) { if (seen.has(e.slug)) continue; seen.add(e.slug); out.push(e); if (out.length >= limit) break }
  return out
}

async function main() {
  let n = 0
  for (const loc of LOCALES) {
    // Products list
    const pr = await strapi('/api/products', { locale: loc, sort: 'updatedAt:desc', populate: listPopulate })
    const list = (pr.data || []).map(mapProductList)
    await write(`products:list:${loc}`, list); n++
    // Product details
    for (const p of list) {
      const one = await strapi('/api/products', { locale: loc, filters: { slug: { $eq: p.slug } }, populate: productPopulate })
      const item = one.data?.[0]
      if (item) { await write(`products:one:${loc}:${p.slug}`, item); n++ }
    }
    // News list (merge locales like the BFF)
    const fetchNews = async (l, limit) => (await strapi('/api/news-posts', { locale: l, sort: 'publishedAt:desc', pagination: { limit }, fields: NEWS_FIELDS, populate: newsListPopulate })).data || []
    const fetchLimit = 200
    let entries = await fetchNews(loc, fetchLimit)
    if (loc !== 'en') {
      const orig = await fetchNews('en', fetchLimit)
      const by = new Map()
      for (const e of [...entries, ...orig]) if (!by.has(e.slug)) by.set(e.slug, e)
      entries = [...by.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    }
    await write(`news:list:${loc}:100`, dedupe(entries, 100).map(mapNews)); n++
    await write(`news:list:${loc}:4`, dedupe(entries, 4).map(mapNews)); n++
    // News details
    for (const e of dedupe(entries, 100)) {
      const one = await strapi('/api/news-posts', { locale: loc, filters: { slug: { $eq: e.slug } }, populate: newsOnePopulate })
      const item = one.data?.[0]
      if (item) { await write(`news:one:${loc}:${e.slug}`, { slug: item.slug, title: item.title, summary: item.summary ?? '', content: item.content ?? '', category: item.category ?? '', publishedAt: item.publishedAt ?? null, cover: item.cover ?? null, seo: item.seo ?? null }); n++ }
    }
    console.log(`locale ${loc} done`)
  }
  console.log(`Done. ${n} snapshot keys written.`)
}
main().catch((e) => { console.error(e); process.exit(1) })