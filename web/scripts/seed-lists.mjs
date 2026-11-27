// Deterministically seed the list snapshot keys by fetching them from a running
// Nuxt BFF and upserting into web_snapshot (awaited, so nothing is lost to a
// fire-and-forget race). Use while Strapi + Nuxt are running.
//
// Usage: node web/scripts/seed-lists.mjs [baseUrl]
import { readFileSync } from 'node:fs'

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const LOCALES = ['en', 'de', 'es', 'fr']

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const sbUrl = env.match(/^NUXT_SUPABASE_URL=(.+)$/m)?.[1]?.trim().replace(/\/$/, '')
const sbKey = env.match(/^NUXT_SUPABASE_SERVICE_KEY=(.+)$/m)?.[1]?.trim()
const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' }

const targets = []
for (const l of LOCALES) {
  targets.push({ key: `products:list:${l}`, path: `/api/products?locale=${l}` })
  targets.push({ key: `news:list:${l}:100`, path: `/api/news?locale=${l}&limit=100` })
  targets.push({ key: `news:list:${l}:4`, path: `/api/news?locale=${l}&limit=4` })
}

let ok = 0
let fail = 0
for (const t of targets) {
  try {
    const res = await fetch(`${base}${t.path}`)
    if (!res.ok) throw new Error(`${res.status} ${t.path}`)
    const payload = await res.json()
    const w = await fetch(`${sbUrl}/rest/v1/web_snapshot`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: t.key, payload, updated_at: new Date().toISOString() }),
    })
    if (!w.ok) throw new Error(`write ${w.status}`)
    ok++
    console.log(`✓ ${t.key} (${Array.isArray(payload) ? payload.length + ' items' : typeof payload})`)
  } catch (err) {
    fail++
    console.warn(`✗ ${t.key} — ${err.message}`)
  }
}
console.log(`\nDone. ${ok} ok, ${fail} failed.`)