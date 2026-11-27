// Sitemap source consumed by @nuxtjs/sitemap (configured in nuxt.config.ts).
// Returns bare paths (no locale prefix); the module expands each into every
// i18n locale and emits xhtml:link hreflang alternates automatically.
//
// We query the English originals for the canonical slug set — product/news
// slugs are shared across locales (only text is localized), so one entry per
// slug is enough and the module handles the per-locale variants.

type SitemapEntry = { url: string; lastmod?: string; changefreq?: string; priority?: number }

export default defineCachedEventHandler(async (event) => {
  const entries: SitemapEntry[] = []

  const [products, news] = await Promise.all([
    $fetch<any[]>('/api/products', { query: { locale: 'en' } }).catch(() => []),
    $fetch<any[]>('/api/news', { query: { locale: 'en', limit: 100 } }).catch(() => []),
  ])

  for (const p of products) {
    if (!p?.slug) continue
    entries.push({
      url: `/products/${p.slug}`,
      ...(p.updatedAt ? { lastmod: new Date(p.updatedAt).toISOString() } : {}),
      changefreq: 'monthly',
      priority: 0.8,
    })
  }

  for (const n of news) {
    if (!n?.slug) continue
    entries.push({
      url: `/news/${n.slug}`,
      ...(n.updatedAt || n.publishedAt
        ? { lastmod: new Date(n.updatedAt || n.publishedAt).toISOString() }
        : {}),
      changefreq: 'yearly',
      priority: 0.6,
    })
  }

  return entries
}, { maxAge: 60 * 60 }) // cache 1h