// Shared Strapi access for the BFF layer.
// The browser never talks to Strapi directly; everything goes through /server/api.

type StrapiMedia = {
  id: number
  url: string
  alternativeText?: string | null
  width?: number
  height?: number
  mime?: string
  name?: string
}

const MEDIA_FIELDS = ['url', 'alternativeText', 'width', 'height', 'mime', 'name']

// Deep populate covering every component used by the Product content-type.
// Dynamic zones need the `on` key per component — a plain `populate` object is
// rejected by Strapi 5 with "Invalid key populate at sections".
export const productPopulate = {
  seo: {
    populate: {
      metaImage: { fields: MEDIA_FIELDS },
      metaSocial: { populate: { image: { fields: MEDIA_FIELDS } } },
    },
  },
  heroImage: { fields: MEDIA_FIELDS },
  heroStats: true,
  quoteCta: true,
  sections: {
    on: {
      'sections.overview': {
        populate: { image: { fields: MEDIA_FIELDS }, stats: true },
      },
      'sections.feature-block': {
        populate: {
          image: { fields: MEDIA_FIELDS },
          items: { populate: { image: { fields: MEDIA_FIELDS } } },
        },
      },
      'sections.endurance': {
        populate: { image: { fields: MEDIA_FIELDS }, points: true },
      },
      'sections.applications': {
        populate: { items: { populate: { image: { fields: MEDIA_FIELDS } } } },
      },
      'sections.showcase': {
        populate: { media: { fields: MEDIA_FIELDS } },
      },
      'sections.editions': true,
      'sections.specifications': {
        populate: { rows: true },
      },
      'sections.faq': {
        populate: { items: true },
      },
    },
  },
}

// Serialize a nested object into Strapi's bracket query format.
// e.g. { populate: { heroImage: { fields: ['url'] } } }
//   -> populate[heroImage][fields][0]=url
function toStrapiQuery(params: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (value === undefined || value === null) continue
    if (typeof value === 'boolean') {
      result[fullKey] = value ? 'true' : 'false'
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null) {
          Object.assign(result, toStrapiQuery(v as Record<string, unknown>, `${fullKey}[${i}]`))
        } else {
          result[`${fullKey}[${i}]`] = String(v)
        }
      })
    } else if (typeof value === 'object') {
      Object.assign(result, toStrapiQuery(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = String(value)
    }
  }
  return result
}

export async function strapiFetch<T>(path: string, query?: Record<string, unknown>): Promise<T> {
  const config = useRuntimeConfig()
  const flatQuery = query ? toStrapiQuery(query) : undefined
  try {
    return await $fetch<T>(`${config.public.strapiUrl}${path}`, {
      query: flatQuery,
      headers: config.strapiToken
        ? { Authorization: `Bearer ${config.strapiToken}` }
        : {},
      // Fail fast so callers can fall back instead of hanging on a down/slow host.
      // 15s tolerates a cold Strapi/Supabase on first (seeding) requests; the live
      // deployment uses snapshot-only mode and never reaches this path.
      timeout: 15000,
    })
  } catch (err: any) {
    // Surface a typed error the data layer can branch on.
    throw createError({
      statusCode: err?.statusCode || 502,
      statusMessage: `Strapi unreachable: ${err?.message || 'request failed'}`,
      cause: err,
    })
  }
}

export type { StrapiMedia }
