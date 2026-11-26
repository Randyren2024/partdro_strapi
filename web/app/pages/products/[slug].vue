<script setup lang="ts">
import { MailOutlined } from '@ant-design/icons-vue'
import { useLocalePath } from '~/composables/useLocalePath'

const route = useRoute()
const lp = useLocalePath()
const { data, error } = await useFetch(`/api/products/${route.params.slug}`) as any

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

const sectionLabel: Record<string, string> = {
  'sections.overview': 'Overview',
  'sections.feature-block': 'Systems',
  'sections.endurance': 'Endurance',
  'sections.applications': 'Missions',
  'sections.showcase': 'Field',
  'sections.editions': 'Editions',
  'sections.specifications': 'Specs',
  'sections.faq': 'FAQ',
}

function navLabel(section: Record<string, any>) {
  return sectionLabel[section.__component] || section.eyebrow || section.title || 'Section'
}

useSeoMeta({
  title: () => `${product.value?.name ?? 'Product'} — Partdro`,
  description: () => product.value?.subtitle ?? '',
})
</script>

<template>
  <article v-if="product" class="product">
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
        <a class="pd-btn pd-btn--solid" href="#quote">Request a quote</a>
        <div v-if="product.heroStats?.length" class="hero-stats">
          <div v-for="(s, index) in product.heroStats" :key="s.id" class="hero-stat">
            <em>{{ String(index + 1).padStart(2, '0') }}</em>
            <strong>{{ s.value }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <nav v-if="product.sections?.length" class="section-nav" aria-label="On this page">
      <a v-for="s in product.sections" :key="s.id" :href="`#sec-${s.id}`">{{ navLabel(s) }}</a>
      <a v-if="product.quoteCta" href="#quote">Quote</a>
    </nav>

    <template v-for="s in product.sections ?? []" :key="s.id">
      <div v-if="sectionMap[s.__component]" :id="`sec-${s.id}`" class="section-anchor">
        <component :is="sectionMap[s.__component]" :section="s" />
      </div>
    </template>

    <section v-if="product.quoteCta" id="quote" class="section quote">
      <div class="container quote-box">
        <p class="eyebrow">Dispatch</p>
        <h2>{{ product.quoteCta.title }}</h2>
        <p class="body-text">{{ product.quoteCta.description }}</p>
        <div class="quote-actions">
          <NuxtLink class="pd-btn pd-btn--solid" :to="lp('/contact')">
            <MailOutlined />
            Contact sales
          </NuxtLink>
          <a class="pd-btn quote-mail" href="mailto:sales@partdro.com">sales@partdro.com</a>
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.product { background: var(--pd-bg); }
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 86vh;
  overflow: hidden;
  color: #f4f1ea;
  background: #07080a;
}
.hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .42;
  filter: saturate(.8) contrast(1.05);
}
.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 8, 10, .2) 0%, rgba(7, 8, 10, .78) 70%, #07080a 100%),
    linear-gradient(90deg, rgba(7, 8, 10, .72), transparent 60%);
}
.hero-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  padding-bottom: clamp(36px, 6vw, 72px);
}
.hero-code {
  margin: 0 0 14px;
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 12px;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.hero-inner h1 {
  max-width: 12ch;
  margin: 0;
  color: #f4f1ea;
  font-size: clamp(3.6rem, 8vw, 7.4rem);
  line-height: .86;
  letter-spacing: -.03em;
  text-transform: uppercase;
}
.hero-sub {
  max-width: 40rem;
  margin: 18px 0 28px;
  color: rgba(244, 241, 234, .78);
  font-size: clamp(16px, 1.6vw, 19px);
}
.hero-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin-top: clamp(28px, 4vw, 48px);
  border-top: 1px solid rgba(244, 241, 234, .16);
}
.hero-stat {
  padding: 16px 18px 8px 0;
  border-right: 1px solid rgba(244, 241, 234, .12);
}
.hero-stat:last-child { border-right: 0; }
.hero-stat em {
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  font-style: normal;
  letter-spacing: .14em;
}
.hero-stat strong {
  display: block;
  margin-top: 6px;
  font-family: var(--pd-font-display);
  font-size: clamp(2rem, 3vw, 3rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: .9;
}
.hero-stat span {
  display: block;
  margin-top: 6px;
  color: rgba(244, 241, 234, .6);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.section-nav {
  position: sticky;
  top: var(--pd-header-height);
  z-index: 30;
  display: flex;
  overflow-x: auto;
  background: color-mix(in srgb, var(--pd-bg) 88%, transparent);
  border-bottom: 1px solid var(--pd-line-strong);
  backdrop-filter: blur(14px);
}
.section-nav a {
  flex: 0 0 auto;
  padding: 14px 18px;
  border-right: 1px solid var(--pd-line);
  color: var(--pd-ink-soft);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.section-nav a:hover { color: var(--pd-primary); }
.section-anchor { scroll-margin-top: calc(var(--pd-header-height) + 52px); }
.quote { background: #07080a; color: #f4f1ea; }
.quote-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: clamp(8px, 2vw, 20px) 0 clamp(8px, 2vw, 20px) clamp(18px, 3vw, 28px);
  border-left: 3px solid var(--pd-primary);
}
.quote h2 { color: #f4f1ea; }
.quote .body-text { color: rgba(244, 241, 234, .7); }
.quote-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.quote-mail { border-color: rgba(244, 241, 234, .4); color: #f4f1ea; }
.quote-mail:hover { border-color: var(--pd-accent); color: var(--pd-accent); }
@media (max-width: 700px) {
  .hero { min-height: 0; padding-top: 72px; }
  .hero-stat { border-right: 0; border-bottom: 1px solid rgba(244, 241, 234, .12); }
}
</style>
