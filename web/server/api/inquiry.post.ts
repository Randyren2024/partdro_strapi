type InquiryBody = {
  name?: string
  email?: string
  phone?: string
  type?: string
  message?: string
  website?: string
  page?: string
  productSlug?: string
}

const TYPES = ['contact', 'booking', 'franchise']

export default defineEventHandler(async (event) => {
  const body = await readBody<InquiryBody>(event)

  // Honeypot: silently accept so bots do not retry.
  if (body?.website) return { ok: true, spam: true }

  const name = body?.name?.trim() ?? ''
  const email = body?.email?.trim() ?? ''
  const message = body?.message?.trim() ?? ''
  if (!name || !email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Name, email and message are required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  // Store submissions directly in Supabase (the live site runs without Strapi).
  try {
    await insertRow('web_inquiries', {
      name,
      email,
      phone: body?.phone?.trim() || null,
      type: TYPES.includes(body?.type ?? '') ? body!.type : 'contact',
      message,
      page: body?.page?.slice(0, 300) || null,
      product_slug: body?.productSlug?.slice(0, 200) || null,
    })
  } catch (err: any) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Inquiry storage is unavailable',
      cause: err,
    })
  }

  return { ok: true }
})