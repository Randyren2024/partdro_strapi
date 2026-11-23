export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const res = await strapiFetch<{ data: any[] | null }>('/api/products', {
    filters: { slug: { $eq: slug } },
    populate: productPopulate,
  })
  const product = res.data?.[0]
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  return product
})
