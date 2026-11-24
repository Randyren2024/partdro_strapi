export default defineEventHandler(async () => {
  const res = await strapiFetch<{ data: any[] }>('/api/products', {
    sort: 'updatedAt:desc',
    populate: {
      heroImage: { fields: ['url', 'alternativeText', 'width', 'height'] },
    },
  })
  return res.data.map((p) => ({
    slug: p.slug,
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    subtitle: p.subtitle,
    category: p.category ?? null,
    heroImage: p.heroImage ?? null,
  }))
})
