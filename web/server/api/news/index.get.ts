const NEWS_FIELDS = ['slug', 'title', 'summary', 'category', 'publishedAt']

type NewsEntry = {
  slug: string
  title: string
  summary?: string | null
  category?: string | null
  publishedAt?: string | null
  cover?: { url: string; alternativeText?: string | null; width?: number; height?: number } | null
}

async function fetchNews(locale: string | undefined, limit: number) {
  const res = await strapiFetch<{ data: NewsEntry[] }>('/api/news-posts', {
    locale,
    sort: 'publishedAt:desc',
    pagination: { limit },
    fields: NEWS_FIELDS,
    populate: { cover: { fields: ['url', 'alternativeText', 'width', 'height'] } },
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'
  const limit = Math.min(Number(query.limit) || 100, 100)

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
  entries = dedupeBySlug(entries, limit)

  return entries.map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary ?? '',
    category: p.category ?? '',
    publishedAt: p.publishedAt ?? null,
    cover: p.cover ?? null,
  }))
})