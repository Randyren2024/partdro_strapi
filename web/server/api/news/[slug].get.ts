export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  const post = await getNewsOne(slug, locale)
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  return post
})