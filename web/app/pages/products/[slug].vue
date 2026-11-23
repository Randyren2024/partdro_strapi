<script setup lang="ts">
const route = useRoute()
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

useSeoMeta({
  title: () => `${product.value?.name ?? 'Product'} — Partdro`,
  description: () => product.value?.subtitle ?? '',
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
        <a class="btn" href="#quote">Request a quote</a>
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
        <a class="btn" href="mailto:sales@partdro.com">Contact sales</a>
      </div>
    </section>
  </article>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 78vh;
  display: flex; align-items: flex-end;
  background: var(--ink);
  color: var(--paper);
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
    linear-gradient(180deg, rgba(12,15,18,0.35) 0%, rgba(12,15,18,0.85) 78%, #0c0f12 100%),
    linear-gradient(90deg, rgba(12,15,18,0.55) 0%, rgba(12,15,18,0) 55%);
}
.hero-inner { position: relative; z-index: 1; width: 100%; padding-bottom: clamp(40px, 6vw, 72px); }
.hero-code {
  font-family: var(--font-mono); font-size: 13px;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 14px;
}
.hero-inner h1 { font-size: clamp(40px, 7vw, 84px); line-height: 1.02; letter-spacing: -0.015em; max-width: 14ch; }
.hero-sub { max-width: 56ch; font-size: clamp(15px, 1.6vw, 19px); color: rgba(244, 242, 236, 0.82); margin: 18px 0 28px; }
.hero-stats {
  display: flex; flex-wrap: wrap; gap: 0;
  margin-top: clamp(32px, 5vw, 56px);
  border-top: 1px solid rgba(244, 242, 236, 0.22);
}
.hero-stat {
  padding: 18px 32px 6px 0;
  margin-right: 32px;
  border-right: 1px solid rgba(244, 242, 236, 0.14);
}
.hero-stat:last-child { border-right: none; }
.hero-stat strong {
  display: block;
  font-family: var(--font-display); font-stretch: 90%;
  font-size: clamp(26px, 3.4vw, 40px); font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hero-stat span {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(244, 242, 236, 0.62);
}

.quote { background: var(--ink); color: var(--paper); }
.quote-box {
  display: flex; flex-direction: column; align-items: flex-start; gap: 18px;
  border-left: 3px solid var(--accent);
  padding-left: clamp(20px, 4vw, 40px);
}
.quote .body-text { color: rgba(244, 242, 236, 0.72); margin: 0; }
</style>
