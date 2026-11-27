// Import legacy landing pages (c500 / u15 / vf50p) into THIS project's Strapi as
// products with structured sections. Uses each page's own content/{locale}.json
// for en/de/es/fr text (no machine translation) and uploads the hero image.
//
// Usage: node web/scripts/import-landing.mjs [--only c500]
// Requires Strapi on :1337 and NUXT_STRAPI_FULL_TOKEN in web/.env.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const STRAPI = (process.env.STRAPI_URL || 'http://localhost:1337').replace(/\/$/, '')
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const TOKEN = env.match(/^NUXT_STRAPI_FULL_TOKEN=(.+)$/m)?.[1]?.trim()
if (!TOKEN) { console.error('Missing NUXT_STRAPI_FULL_TOKEN'); process.exit(1) }

const LANDING = 'C:/Users/81102/Desktop/legacy_partdro/partdro/landing'
const PAGES = [
  { dir: 'eavision-c500', slug: 'c500-partdro-eavision', code: 'PD-C500', category: 'delivery-logistics' },
  { dir: 'u15', slug: 'u15-multi-mission-drone', code: 'PD-U15', category: 'multi-mission' },
  { dir: 'vf50p', slug: 'vf50p-long-endurance-vtol-uav', code: 'PD-VF50P', category: 'multi-mission' },
]
const LOCALES = ['en', 'de', 'es', 'fr']
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null

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

async function upload(localPath) {
  const bytes = readFileSync(localPath)
  const form = new FormData()
  form.append('files', new Blob([bytes]), localPath.split('/').pop())
  const r = await fetch(`${STRAPI}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form })
  const text = await r.text()
  if (!r.ok) throw new Error(`upload ${r.status} ${localPath}: ${text.slice(0, 200)}`)
  return JSON.parse(text)?.[0]?.id ?? null
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const toItems = (arr) => arr.map((x) => ({ title: x.title || x.name || '', description: x.detail || x.description || x.summary || '' }))

function buildSections(j) {
  const sections = []
  if (j.overview) {
    const paras = j.overview.paragraphs || (typeof j.overview === 'string' ? [j.overview] : [])
    if (paras.length) sections.push({ __component: 'sections.overview', title: 'Overview', body: paras.join('\n\n') })
  }
  const groups = []
  const push = (title, items) => { if (items && items.length) groups.push({ title, items }) }
  if (j.abilities) push('Key Capabilities', toItems(j.abilities))
  if (j.decisions) push('Autonomous Decisions', toItems(j.decisions))
  if (j.galleries) for (const [k, g] of Object.entries(j.galleries)) push(g.label || titleCase(k), toItems(g.items || []))
  for (const k of ['pod', 'endurance', 'safety', 'autonomy', 'control', 'payloads', 'architecture', 'envelope']) {
    if (!j[k]) continue
    if (Array.isArray(j[k])) push(titleCase(k), toItems(j[k]))
    else if (j[k].items) push(j[k].label || j[k].title || titleCase(k), toItems(j[k].items))
    else if (j[k].title) push(j[k].title, toItems(j[k].points || j[k].features || []))
  }
  for (const g of groups) sections.push({ __component: 'sections.feature-block', title: g.title, items: g.items })

  const specs = (j.specifications && j.specifications.items) || (j.specs && j.specs.items)
  if (specs && specs.length) sections.push({ __component: 'sections.specifications', title: (j.specifications && j.specifications.title) || (j.specs && j.specs.title) || 'Specifications', rows: specs.map((s) => ({ label: s.label, value: String(s.value) })) })

  if (j.applications && j.applications.items && j.applications.items.length) sections.push({ __component: 'sections.applications', title: j.applications.heading || 'Applications', items: j.applications.items.map((a) => ({ title: a.title, description: a.description || '' })) })

  const faqItems = (j.faq && j.faq.items) || (Array.isArray(j.faq) ? j.faq : [])
  if (faqItems.length) sections.push({ __component: 'sections.faq', title: 'FAQ', items: faqItems.map((f) => ({ question: f.question || f.q || '', answer: f.answer || f.a || '' })) })

  const pkgs = (j.packages && j.packages.items) || (j.editions && j.editions.items)
  if (pkgs && pkgs.length) sections.push({ __component: 'sections.editions', title: (j.packages && j.packages.heading) || (j.editions && j.editions.title) || 'Editions', description: (j.packages && j.packages.intro) || '', headers: ['Package', 'Variant', 'Summary'], rows: pkgs.map((p) => [p.name || p.title || '', p.variant || '', p.summary || p.description || '']) })
  return sections
}

function text(j) {
  const paras = (j.overview && j.overview.paragraphs) || []
  return {
    name: (j.hero && j.hero.title) || (j.meta && j.meta.productName) || 'Product',
    tagline: (j.hero && j.hero.summary) || '',
    subtitle: (j.hero && j.hero.eyebrow) || paras[0] || '',
  }
}

async function main() {
  const pages = ONLY ? PAGES.filter((p) => p.dir === ONLY || p.slug === ONLY) : PAGES
  for (const page of pages) {
    console.log(`=== ${page.slug} (${page.dir}) ===`)
    const content = {}
    for (const loc of LOCALES) {
      const p = `${LANDING}/${page.dir}/src/data/content/${loc}.json`
      content[loc] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
    }
    const en = content.en
    if (!en) { console.error(`  no en content for ${page.dir}`); continue }

    // Hero image (shared) from the image manifest.
    let heroId = null
    try {
      const manifest = JSON.parse(readFileSync(`${LANDING}/${page.dir}/src/data/image-manifest.json`, 'utf8'))
      const heroFile = manifest.hero?.file
      if (heroFile) heroId = await upload(`${LANDING}/${page.dir}/public/${heroFile}`)
    } catch (e) { console.warn('  hero upload skipped:', e.message) }

    const base = { slug: page.slug, code: page.code, category: page.category, ...(heroId ? { heroImage: heroId } : {}), sections: buildSections(en) }
    const quoteCta = en.quote ? { title: en.quote.title || 'Request a quote', description: en.quote.lead || '' } : undefined

    // Find existing by slug
    let existing = null
    try { existing = (await strapi(`/api/products?filters[slug][$eq]=${encodeURIComponent(page.slug)}&status=draft`)).data?.[0] || null } catch {}
    let documentId
    if (existing) {
      await strapi(`/api/products/${existing.documentId}?status=published`, 'PUT', { data: { ...base, ...text(en), ...(quoteCta ? { quoteCta } : {}) } })
      documentId = existing.documentId
      console.log('  PUT', page.slug)
    } else {
      const created = await strapi(`/api/products?status=published`, 'POST', { data: { ...base, ...text(en), ...(quoteCta ? { quoteCta } : {}) } })
      documentId = created.data?.documentId
      console.log('  POST', page.slug)
    }
    // Translations
    for (const loc of ['de', 'es', 'fr']) {
      const j = content[loc]
      if (!j) continue
      const q = j.quote ? { title: j.quote.title || 'Request a quote', description: j.quote.lead || '' } : quoteCta
      const payload = { slug: page.slug, code: page.code, category: page.category, ...text(j), sections: buildSections(j), ...(q ? { quoteCta: q } : {}) }
      try { await strapi(`/api/products/${documentId}?locale=${loc}&status=published`, 'PUT', { data: payload }) }
      catch (e) { console.warn(`  ${loc} failed:`, e.message) }
    }
  }
  console.log('\nDone.')
}
main().catch((e) => { console.error(e); process.exit(1) })