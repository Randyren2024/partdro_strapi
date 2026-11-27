import { useLocaleHead } from '#i18n'

/**
 * Unified SEO head builder.
 *
 * Combines three sources so every page gets consistent, locale-aware metadata:
 *   1. @nuxtjs/i18n `useLocaleHead()` — emits <html lang>, canonical and
 *      hreflang alternates (en/de/es/fr + x-default) for the current route,
 *      automatically. This replaces the hand-written canonical/hreflang blocks.
 *   2. Per-page inputs (title / description / image / robots / JSON-LD).
 *   3. The Strapi `shared.seo` component values, when a page passes `seo`.
 *
 * Usage in a page:
 *   useSeo({
 *     title: () => product.value?.seo?.metaTitle || product.value?.name,
 *     description: () => product.value?.seo?.metaDescription || product.value?.subtitle,
 *     path: `/products/${slug}`,        // optional; defaults to current route
 *     image: () => heroImageUrl,
 *     jsonLd: () => [...],
 *   })
 */

type SeoInput = {
  title?: string | (() => string | undefined | null)
  description?: string | (() => string | undefined | null)
  image?: string | (() => string | undefined | null)
  /** Bare path WITHOUT locale prefix (e.g. "/products/c15"). Defaults to route. */
  path?: string | (() => string | undefined)
  /** robots directive; defaults to index,follow. */
  robots?: string | (() => string | undefined)
  /** og:type, e.g. "website" | "article" | "product". */
  type?: string | (() => string | undefined)
  /** JSON-LD object or array of objects (schema.org). */
  jsonLd?: Record<string, any> | Record<string, any>[] | (() => any)
  /** Extra meta tags to append. */
  extraMeta?: Array<Record<string, string>> | (() => Array<Record<string, string>>)
}

const resolve = <T>(v: T | (() => T)): T => (typeof v === 'function' ? (v as () => T)() : v)

export function useSeo(input: SeoInput = {}) {
  const { t, locale } = useI18n()
  const localeHead = useLocaleHead()
  const config = useRuntimeConfig()
  const SITE_URL = (config.public.siteUrl || 'https://www.droneworld.tech').replace(/\/$/, '')
  const asset = useStrapiAsset()

  const siteName = 'Partdro'
  // Page titles are expected to be complete (the i18n meta.* strings already
  // carry "| Partdro"); detail pages append their own suffix. So no template.
  const titleSuffix = '%s'
  const gscToken = config.public.googleSiteVerification as string | undefined

  const absUrl = (u?: string | null) => {
    if (!u) return undefined
    if (/^https?:\/\//i.test(u)) return u
    return `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`
  }

  const currentPath = () => {
    const p = resolve(input.path)
    if (p) return p.startsWith('/') ? p : `/${p}`
    // strip locale prefix from the current route to get the bare path
    const seg = useRoute().path.split('/')[1]
    const bare = seg && ['en', 'de', 'es', 'fr'].includes(seg) && seg !== 'en'
      ? useRoute().path.slice(seg.length + 1) || '/'
      : useRoute().path
    return bare
  }

  const canonicalFor = (barePath: string) => {
    const loc = locale.value
    const prefix = loc === 'en' ? '' : `/${loc}`
    return `${SITE_URL}${prefix}${barePath === '/' ? '' : barePath}`
  }

  useHead(() => {
    const barePath = currentPath()
    const canonical = canonicalFor(barePath)
    const title = resolve(input.title) || t('meta.home.title')
    const description = resolve(input.description) || ''
    const rawImage = resolve(input.image)
    const image = rawImage ? absUrl(asset(rawImage)) : undefined
    const robots = resolve(input.robots) || 'index, follow, max-image-preview:large'
    const type = resolve(input.type) || 'website'
    const jsonLd = resolve(input.jsonLd as any)
    const extraMeta = resolve(input.extraMeta as any) || []

    // Start from i18n's locale head (html lang + canonical + hreflang alternates),
    // then layer our own canonical (kept consistent with i18n) and meta on top.
    const base = (localeHead.value || {}) as any

    const ldScripts = jsonLd
      ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((obj) => ({
          type: 'application/ld+json',
          innerHTML: JSON.stringify(obj),
        }))
      : []

    return {
      ...base,
      title,
      titleTemplate: titleSuffix,
      htmlAttrs: { ...(base.htmlAttrs || {}), lang: locale.value },
      link: [
        ...((base.link as any[]) || []),
        { rel: 'canonical', href: canonical },
      ],
      meta: [
        ...((base.meta as any[]) || []),
        { name: 'description', content: description },
        { name: 'robots', content: robots },
        { property: 'og:site_name', content: siteName },
        { property: 'og:type', content: type },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonical },
        { property: 'og:locale', content: ({ en: 'en_US', de: 'de_DE', es: 'es_ES', fr: 'fr_FR' } as Record<string, string>)[locale.value] || 'en_US' },
        ...(image ? [{ property: 'og:image', content: image }] : []),
        { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        ...(image ? [{ name: 'twitter:image', content: image }] : []),
        ...(gscToken ? [{ name: 'google-site-verification', content: gscToken }] : []),
        ...extraMeta,
      ],
      script: [...((base.script as any[]) || []), ...ldScripts],
    }
  })
}