<script setup lang="ts">
import { MailOutlined } from '@ant-design/icons-vue'
import { useSeo } from '~/composables/useSeo'

const route = useRoute()
const { locale } = useI18n()
const slug = route.params.slug as string

const { data, error } = await useFetch(`/api/products/${slug}`, {
  key: `product:${slug}`,
  query: { locale },
}) as any

if (error.value || !data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Product not found' })
}

const product = computed(() => data.value as Record<string, any>)

const asset = useStrapiAsset()

const sectionMap: Record<string, any> = {
  'sections.overview': resolveComponent('OverviewSection'),
  'sections.feature-block': resolveComponent('FeatureBlock'),
  'sections.endurance': resolveComponent('EnduranceSection'),
  'sections.applications': resolveComponent('ApplicationsSection'),
  'sections.showcase': resolveComponent('ShowcaseSection'),
  'sections.editions': resolveComponent('EditionsSection'),
  'sections.specifications': resolveComponent('SpecificationsSection'),
  'sections.faq': resolveComponent('FaqSection'),
}

const config = useRuntimeConfig()
const SITE_URL = (config.public.siteUrl || 'https://www.droneworld.tech').replace(/\/$/, '')

const heroImageUrl = computed(() => {
  const u = product.value?.heroImage?.url
  return u ? asset(u) : undefined
})

const seoTitle = computed(() => {
  const base = product.value?.seo?.metaTitle || product.value?.name || 'Product'
  return /\| Partdro/i.test(base) ? base : `${base} | Partdro`
})
const seoDescription = computed(
  () => product.value?.seo?.metaDescription || product.value?.subtitle || '',
)

useSeo({
  title: () => seoTitle.value,
  description: () => seoDescription.value,
  path: `/products/${slug}`,
  image: () => heroImageUrl.value,
  type: () => 'product',
  jsonLd: () => {
    const p = product.value
    if (!p) return []
    const url = `${SITE_URL}${locale.value === 'en' ? '' : `/${locale.value}`}/products/${slug}`
    return [
      {
        '@type': 'Product',
        name: p.name,
        description: seoDescription.value,
        sku: p.code,
        url,
        ...(heroImageUrl.value ? { image: [heroImageUrl.value] } : {}),
        brand: { '@type': 'Brand', name: 'Partdro' },
        manufacturer: { '@type': 'Organization', name: 'Partdro', url: SITE_URL },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE_URL}/products` },
          { '@type': 'ListItem', position: 3, name: p.name, item: url },
        ],
      },
    ]
  },
})
</script>

<template>
  <article v-if="product">
    <!-- HERO -->
    <section class="hero">
      <img
        v-if="product.heroImage"
        class="hero-bg"
        :src="asset(product.heroImage.url)"
        :alt="product.heroImage.alternativeText || product.name"
      />
      <div class="hero-scrim" />
      <div class="hero-inner container">
        <p class="hero-code">{{ product.code }}<template v-if="product.tagline"> · {{ product.tagline }}</template></p>
        <h1>{{ product.name }}</h1>
        <p class="hero-sub">{{ product.subtitle }}</p>
        <a-button type="primary" size="large" href="#quote">Request a quote</a-button>
        <div v-if="product.heroStats?.length" class="hero-stats">
          <div v-for="s in product.heroStats" :key="s.id" class="hero-stat">
            <strong>{{ s.value }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- DYNAMIC SECTIONS -->
    <template v-for="s in product.sections ?? []" :key="s.id">
      <component
        :is="sectionMap[s.__component]"
        v-if="sectionMap[s.__component]"
        :section="s"
      />
    </template>

    <!-- QUOTE CTA -->
    <section v-if="product.quoteCta" id="quote" class="section quote">
      <div class="container quote-box">
        <h2>{{ product.quoteCta.title }}</h2>
        <p class="body-text">{{ product.quoteCta.description }}</p>
        <a-button type="primary" size="large" href="mailto:sales@partdro.com">
          <template #icon><MailOutlined /></template>
          Contact sales
        </a-button>
      </div>
    </section>
  </article>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 78vh;
  display: flex; align-items: flex-end;
  background: var(--color-bg-dark);
  color: var(--color-text-inverse);
  overflow: hidden;
}
.hero-bg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; opacity: 0.55;
}
.hero-scrim {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(20, 20, 20, 0.35) 0%, rgba(20, 20, 20, 0.85) 78%, #141414 100%),
    linear-gradient(90deg, rgba(20, 20, 20, 0.55) 0%, rgba(20, 20, 20, 0) 55%);
}
.hero-inner { position: relative; z-index: 1; width: 100%; padding-bottom: clamp(40px, 6vw, 72px); }
@media (max-width: 1120px) {
  .hero-inner { padding-inline: clamp(16px, 4vw, 48px); }
}
.hero-code {
  font-family: var(--font-family-code); font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--color-primary); margin: 0 0 14px;
}
.hero-inner h1 {
  margin: 0;
  font-size: clamp(40px, 7vw, 84px);
  line-height: 1.02;
  letter-spacing: -0.015em;
  max-width: 14ch;
}
.hero-sub {
  max-width: 56ch;
  font-size: clamp(15px, 1.6vw, 19px);
  color: rgba(255, 255, 255, 0.82);
  margin: 18px 0 28px;
}
.hero-stats {
  display: flex; flex-wrap: wrap; gap: 0;
  margin-top: clamp(32px, 5vw, 56px);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}
.hero-stat {
  padding: 18px 32px 6px 0;
  margin-right: 32px;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}
.hero-stat:last-child { border-right: none; }
.hero-stat strong {
  display: block;
  font-family: var(--font-family);
  font-size: clamp(26px, 3.4vw, 40px);
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.hero-stat span {
  font-family: var(--font-family);
  font-size: 11px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--color-text-dark-tertiary);
}

.quote { background: var(--color-bg-dark); color: var(--color-text-dark); }
.quote-box {
  display: flex; flex-direction: column; align-items: flex-start; gap: 18px;
  border-left: 3px solid var(--color-primary);
  padding-left: clamp(20px, 4vw, 40px);
}
.quote .body-text { color: var(--color-text-dark-secondary); margin: 0; }
</style>
