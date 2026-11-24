type NewsEntry = {
  slug: string
  title: string
  summary?: string | null
  content?: string | null
  category?: string | null
  publishedAt?: string | null
  cover?: { url: string; alternativeText?: string | null; width?: number; height?: number } | null
}

async function fetchOne(slug: string, locale: string | undefined) {
  const res = await strapiFetch<{ data: NewsEntry[] }>('/api/news-posts', {
    locale,
    filters: { slug: { $eq: slug } },
    populate: { cover: { fields: ['url', 'alternativeText', 'width', 'height'] } },
  })
  return res.data?.[0] ?? null
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  let post = await fetchOne(slug, locale)
  if (!post && locale !== 'en') post = await fetchOne(slug, 'en')
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Article not found' })

  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary ?? '',
    content: post.content ?? '',
    category: post.category ?? '',
    publishedAt: post.publishedAt ?? null,
    cover: post.cover ?? null,
  }
})