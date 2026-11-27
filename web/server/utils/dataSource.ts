// Data source with Strapi-first + Supabase snapshot fallback.
//
// Every read tries Strapi (fast-fail via strapiFetch's timeout). On success the
// assembled JSON is written to the `web_snapshot` table; when Strapi is empty or
// unreachable the last snapshot is served instead. This keeps the storefront
// rendering even when the Linux Strapi host is not running.
//
// Pages and API handlers must go through these helpers so the fallback applies
// uniformly (products, news, and the sitemap that reuses the list endpoints).

import { productPopulate, strapiFetch } from './strapi'

const PRODUCT_LIST_POPULATE = {
  seo: {
    populate: {
      metaImage: { fields: ['url', 'alternativeText', 'width', 'height'] },
    },
  },
  heroImage: { fields: ['url', 'alternativeText', 'width', 'height'] },
}

const NEWS_FIELDS = ['slug', 'title', 'summary', 'category', 'publishedAt', 'updatedAt']

type NewsEntry = {
  slug: string
  title: string
  summary?: string | null
  content?: string | null
  category?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  cover?: { url: string; alternativeText?: string | null; width?: number; height?: number } | null
  seo?: any
}

// Run a Strapi fetch, and on empty/error fall back to the snapshot for `key`.
async function withSnapshot<T>(
  key: string,
  fetcher: () => Promise<T>,
  isEmpty: (value: T) => boolean,
): Promise<T> {
  try {
    const value = await fetcher()
    if (isEmpty(value)) {
      const snap = await readSnapshot<T>(key)
      return snap ?? value
    }
    // Fire-and-forget: snapshot writes never block or break the response.
    writeSnapshot(key, value)
    return value
  } catch {
    const snap = await readSnapshot<T>(key)
    if (snap != null) return snap
    throw createError({ statusCode: 502, statusMessage: 'Data source unavailable' })
  }
}

const notEmptyArray = <T>(v: T[]) => v.length > 0
const notNull = <T>(v: T | null) => v != null

// Snapshot-only mode: skip Strapi entirely (used by the Cloudflare deployment).
function strapiDisabled() {
  return useRuntimeConfig().strapiDisabled === true
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

async function fetchProducts(locale: string) {
  const res = await strapiFetch<{ data: any[] }>('/api/products', {
    locale,
    sort: 'updatedAt:desc',
    populate: PRODUCT_LIST_POPULATE,
  })
  return res.data.map((p) => ({
    slug: p.slug,
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    subtitle: p.subtitle,
    category: p.category ?? null,
    heroImage: p.heroImage ?? null,
    seo: p.seo ?? null,
    updatedAt: p.updatedAt ?? null,
  }))
}

export async function getProducts(locale = 'en') {
  const key = `products:list:${locale}`
  if (strapiDisabled()) return (await readSnapshot<any[]>(key)) ?? []
  return withSnapshot(key, () => fetchProducts(locale), notEmptyArray)
}

async function fetchOneProduct(slug: string, locale: string) {
  const res = await strapiFetch<{ data: any[] | null }>('/api/products', {
    locale,
    filters: { slug: { $eq: slug } },
    populate: productPopulate,
  })
  return res.data?.[0] ?? null
}

export async function getProduct(slug: string, locale = 'en') {
  const key = `products:one:${locale}:${slug}`
  if (strapiDisabled()) return (await readSnapshot<any>(key)) ?? null
  try {
    let product = await fetchOneProduct(slug, locale)
    // Fall back to the English original when a locale has no translation yet.
    if (!product && locale !== 'en') product = await fetchOneProduct(slug, 'en')
    if (notNull(product)) {
      writeSnapshot(key, product)
      return product
    }
    return (await readSnapshot(key)) ?? null
  } catch {
    return (await readSnapshot(key)) ?? null
  }
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

async function fetchNews(locale: string | undefined, limit: number): Promise<NewsEntry[]> {
  const res = await strapiFetch<{ data: NewsEntry[] }>('/api/news-posts', {
    locale,
    sort: 'publishedAt:desc',
    pagination: { limit },
    fields: NEWS_FIELDS,
    populate: {
      cover: { fields: ['url', 'alternativeText', 'width', 'height'] },
      seo: { populate: { metaImage: { fields: ['url', 'alternativeText', 'width', 'height'] } } },
    },
  })
  return res.data ?? []
}

// The imported legacy rows exist twice per document (draft + published copy),
// so collapse them by slug before applying the requested limit.
function dedupeBySlug(entries: NewsEntry[], limit: number) {
  const seen = new Set<string>()
  const unique: NewsEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.slug)) continue
    seen.add(entry.slug)
    unique.push(entry)
    if (unique.length >= limit) break
  }
  return unique
}

function mapNewsList(entries: NewsEntry[]) {
  return entries.map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary ?? '',
    category: p.category ?? '',
    publishedAt: p.publishedAt ?? null,
    updatedAt: p.updatedAt ?? null,
    cover: p.cover ?? null,
    seo: p.seo ?? null,
  }))
}

async function fetchNewsList(locale: string, limit: number) {
  // Only a few legacy articles are translated. Merge the current locale with
  // the English originals so /de, /es and /fr still list every article.
  const fetchLimit = Math.min(limit * 2, 200)
  const localized = await fetchNews(locale, fetchLimit)
  let entries = localized
  if (locale !== 'en') {
    const originals = await fetchNews('en', fetchLimit)
    const bySlug = new Map<string, NewsEntry>()
    for (const entry of [...localized, ...originals]) {
      if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry)
    }
    entries = [...bySlug.values()].sort((a, b) =>
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
    )
  }
  return mapNewsList(dedupeBySlug(entries, limit))
}

export async function getNews(locale = 'en', limit = 100) {
  const key = `news:list:${locale}:${limit}`
  if (strapiDisabled()) return (await readSnapshot<any[]>(key)) ?? []
  return withSnapshot(key, () => fetchNewsList(locale, limit), notEmptyArray)
}

async function fetchOneNews(slug: string, locale: string): Promise<NewsEntry | null> {
  const res = await strapiFetch<{ data: NewsEntry[] }>('/api/news-posts', {
    locale,
    filters: { slug: { $eq: slug } },
    populate: {
      cover: { fields: ['url', 'alternativeText', 'width', 'height'] },
      seo: {
        populate: {
          metaImage: { fields: ['url', 'alternativeText', 'width', 'height'] },
          metaSocial: { populate: { image: { fields: ['url', 'alternativeText', 'width', 'height'] } } },
        },
      },
    },
  })
  return res.data?.[0] ?? null
}

function mapNewsOne(post: NewsEntry) {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary ?? '',
    content: post.content ?? '',
    category: post.category ?? '',
    publishedAt: post.publishedAt ?? null,
    cover: post.cover ?? null,
    seo: post.seo ?? null,
  }
}

export async function getNewsOne(slug: string, locale = 'en') {
  const key = `news:one:${locale}:${slug}`
  if (strapiDisabled()) return (await readSnapshot<any>(key)) ?? null
  try {
    let post = await fetchOneNews(slug, locale)
    if (!post && locale !== 'en') post = await fetchOneNews(slug, 'en')
    if (notNull(post)) {
      const mapped = mapNewsOne(post)
      writeSnapshot(key, mapped)
      return mapped
    }
    return (await readSnapshot(key)) ?? null
  } catch {
    return (await readSnapshot(key)) ?? null
  }
}