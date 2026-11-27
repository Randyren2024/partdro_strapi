// Add de/es/fr translations to the 4 original (en-only) products using the
// configured LLM. Translates all text leaf fields generically, preserves structure.
//
// Usage: node web/scripts/translate-products.mjs [slug ...]
// Requires Strapi on :1337, NUXT_STRAPI_TOKEN, and web/scripts/ingest/ai_config.json.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

const STRAPI = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '')
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const TOKEN = env.match(/^NUXT_STRAPI_FULL_TOKEN=(.+)$/m)?.[1]?.trim()
const ai = JSON.parse(readFileSync(new URL('./ingest/ai_config.json', import.meta.url), 'utf8'))
// Prefer a free/working provider (OpenRouter); fall back to the active config.
const cfg = (ai.configs || []).find((c) => c.presetId === 'openrouter') || (ai.configs || []).find((c) => c.id === ai.activeId) || (ai.configs || [])[0]
if (!cfg?.apiKey && !cfg?.api_key) { console.error('No AI key in ai_config.json'); process.exit(1) }
const AI_KEY = cfg.apiKey || cfg.api_key
const TARGETS = process.argv.slice(2).length ? process.argv.slice(2) : ['loong-u15', 'eavision-j150-evo', 'zmd200-heavy-lift-logistics-drone', 'eauav-vertex-c80-c80p-facade-cleaning-drone']
const LOCALES = ['de', 'es', 'fr']
const MEDIA = ['url', 'alternativeText', 'width', 'height']
const SKIP_KEYS = new Set(['url', '__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'slug', 'code', 'category', 'width', 'height', 'mime', 'heroImage', 'cover', 'image', 'media', 'metaImage'])

function toQuery(params, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v == null) continue
    if (typeof v === 'boolean') out[key] = v ? 'true' : 'false'
    else if (Array.isArray(v)) v.forEach((x, i) => { if (x && typeof x === 'object') Object.assign(out, toQuery(x, `${key}[${i}]`)); else out[`${key}[${i}]`] = String(x) })
    else if (typeof v === 'object') Object.assign(out, toQuery(v, key))
    else out[key] = String(v)
  }
  return out
}
const productPopulate = {
  seo: { populate: { metaImage: { fields: MEDIA }, metaSocial: { populate: { image: { fields: MEDIA } } } } },
  heroImage: { fields: MEDIA }, heroStats: true, quoteCta: true,
  sections: { on: {
    'sections.overview': { populate: { image: { fields: MEDIA }, stats: true } },
    'sections.feature-block': { populate: { image: { fields: MEDIA }, items: { populate: { image: { fields: MEDIA } } } } },
    'sections.endurance': { populate: { image: { fields: MEDIA }, points: true } },
    'sections.applications': { populate: { items: { populate: { image: { fields: MEDIA } } } } },
    'sections.showcase': { populate: { media: { fields: MEDIA } } },
    'sections.editions': true, 'sections.specifications': { populate: { rows: true } }, 'sections.faq': { populate: { items: true } },
  } },
}
async function strapi(path, method = 'GET', body) {
  const u = new URL(STRAPI + path)
  if (method === 'GET') for (const [k, v] of Object.entries(toQuery(body || {}))) u.searchParams.set(k, v)
  const r = await fetch(u, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${path}: ${t.slice(0, 300)}`); return r.status === 204 ? null : JSON.parse(t)
}

// Collect translatable string leaves with a path (skip media/ids).
function collect(obj, path, out) {
  if (typeof obj === 'string') { if (obj.trim()) out.push({ path, text: obj }); return }
  if (Array.isArray(obj)) { obj.forEach((v, i) => collect(v, `${path}[${i}]`, out)); return }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_KEYS.has(k)) continue
      collect(v, path ? `${path}.${k}` : k, out)
    }
  }
}
function setPath(obj, path, val) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]
  cur[parts[parts.length - 1]] = val
}

async function translate(strings, locale) {
  const CHUNK = 40
  const out = []
  for (let i = 0; i < strings.length; i += CHUNK) {
    const part = strings.slice(i, i + CHUNK)
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model, temperature: 0.1,
        messages: [
          { role: 'system', content: `You are a professional translator. Translate each "text" field into ${locale}. Return ONLY a JSON array of the same objects with "text" replaced by the translation. Keep "path" unchanged. Do not add commentary.` },
          { role: 'user', content: JSON.stringify(part) },
        ],
      }),
    })
    const j = await res.json()
    const content = j.choices?.[0]?.message?.content || ''
    const m = content.match(/\[[\s\S]*\]/)
    if (!m) throw new Error(`no JSON array in LLM response: ${content.slice(0, 200)}`)
    out.push(...JSON.parse(m[0]))
  }
  return out
}

async function main() {
  const CACHE = new URL('../.tmp/translate-cache/', import.meta.url)
  mkdirSync(CACHE, { recursive: true })
  for (const slug of TARGETS) {
    const en = (await strapi('/api/products', 'GET', { locale: 'en', filters: { slug: { $eq: slug } }, populate: productPopulate })).data?.[0]
    if (!en) { console.warn('not found:', slug); continue }
    // The `on` populate omits __component; populate=* includes it (but not nested
    // text). Merge __component back into the nested sections by index/title.
    const enStar = (await strapi('/api/products', 'GET', { locale: 'en', filters: { slug: { $eq: slug } }, populate: '*' })).data?.[0]
    if (enStar?.sections && en.sections) {
      en.sections = en.sections.map((s, i) => {
        const comp = enStar.sections[i]?.__component || enStar.sections.find((x) => x.title === s.title)?.__component
        return comp ? { __component: comp, ...s } : s
      })
    }
    const strings = []; collect(en, '', strings)
    console.log(`${slug}: ${strings.length} strings`)
    for (const loc of LOCALES) {
      try {
        const cf = new URL(`${slug}-${loc}.json`, CACHE)
        let translated
        if (existsSync(cf)) { translated = JSON.parse(readFileSync(cf, 'utf8')); console.log(`  ${loc} (cached)`) }
        else { translated = await translate(strings, loc); writeFileSync(cf, JSON.stringify(translated)) }
        const clone = JSON.parse(JSON.stringify(en))
        for (const t of translated) if (t.path && typeof t.text === 'string') { try { setPath(clone, t.path, t.text) } catch {} }
        // Strip read-only fields Strapi rejects on write (keep __component first).
        const clean = (o) => {
          if (Array.isArray(o)) return o.map(clean)
          if (o && typeof o === 'object') {
            const r = {}
            for (const [k, v] of Object.entries(o)) {
              if (['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'product'].includes(k)) continue
              r[k] = clean(v)
            }
            return r
          }
          return o
        }
        const payload = { slug: clone.slug, code: clone.code, category: clone.category, name: clone.name, tagline: clone.tagline, subtitle: clone.subtitle, ...(clone.seo ? { seo: clean(clone.seo) } : {}), ...(clone.quoteCta ? { quoteCta: clean(clone.quoteCta) } : {}), sections: clean(clone.sections || []) }
        await strapi(`/api/products/${en.documentId}?locale=${loc}&status=published`, 'PUT', { data: payload })
        console.log(`  ${loc} ok`)
      } catch (e) { console.warn(`  ${loc} failed:`, e.message) }
    }
  }
  console.log('\nDone.')
}
main().catch((e) => { console.error(e); process.exit(1) })