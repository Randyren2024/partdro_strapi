// Refresh the Supabase snapshot by requesting every product/news endpoint the
// storefront uses, for every locale. Run this while Strapi is reachable so the
// BFF writes fresh JSON into `web_snapshot`; afterwards Strapi can be stopped.
//
// Usage (Strapi + a Nuxt server must be running):
//   node web/scripts/refresh-snapshot.mjs [baseUrl]
//   node web/scripts/refresh-snapshot.mjs http://localhost:3000
//
// The Nuxt server can be dev (`npm run dev`) or a prod build — both use the same
// BFF handlers, so either seeds the same snapshot keys.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const LOCALES = ['en', 'de', 'es', 'fr']

async function get(path) {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusMessage || ''} ${path}`)
  return res.json()
}

// Strapi can briefly 502 while it boots/reloads; retry a few times before giving up.
async function getRetry(path, tries = 4) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await get(path)
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr
}

let ok = 0
let failed = 0
async function hit(path) {
  try {
    await get(path)
    ok++
  } catch (err) {
    failed++
    console.warn('  ✗', path, '—', err.message)
  }
}

for (const locale of LOCALES) {
  console.log(`locale ${locale}`)
  // Lists (also discovers slugs). limit=100 seeds /news; limit=4 seeds the
  // "related articles" call on detail pages. Hit products list explicitly so
  // products:list:<locale> is always written.
  const products = await getRetry(`/api/products?locale=${locale}`).catch(() => [])
  await hit(`/api/products?locale=${locale}`)
  await hit(`/api/news?locale=${locale}&limit=100`)
  await hit(`/api/news?locale=${locale}&limit=4`)

  for (const p of products) {
    if (p?.slug) await hit(`/api/products/${encodeURIComponent(p.slug)}?locale=${locale}`)
  }

  const news = await get(`/api/news?locale=${locale}&limit=100`).catch(() => [])
  for (const n of news) {
    if (n?.slug) await hit(`/api/news/${encodeURIComponent(n.slug)}?locale=${locale}`)
  }
}

console.log(`\nDone. ${ok} ok, ${failed} failed (base ${base}).`)
if (failed > 0) process.exitCode = 1