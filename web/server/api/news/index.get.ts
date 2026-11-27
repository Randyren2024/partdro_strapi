export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'
  const limit = Math.min(Number(query.limit) || 100, 100)
  return await getNews(locale, limit)
})