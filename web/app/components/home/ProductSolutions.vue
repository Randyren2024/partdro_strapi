<template>
  <section class="solutions section">
    <div class="container">
      <p class="eyebrow">{{ t("products.viewAll") }}</p>
      <h2 class="section-title">{{ t("products.title") }}</h2>
      <p class="section-subtitle">{{ t("products.subtitle") }}</p>

      <article v-if="featured" class="solutions__feature">
        <div class="solutions__feature-media">
          <img
            :src="asset(featured.heroImage?.url)"
            :alt="featured.heroImage?.alternativeText || featured.name"
            width="960"
            height="640"
          />
          <span class="solutions__stamp">01</span>
        </div>
        <div class="solutions__feature-copy">
          <p v-if="featured.category" class="eyebrow">{{ categoryLabel(featured.category) }}</p>
          <h3>{{ featured.name }}</h3>
          <p>{{ featured.tagline || featured.subtitle }}</p>
          <router-link :to="lp('/products/' + featured.slug)" class="pd-btn pd-btn--solid">
            {{ t("products.viewDetails") }}
          </router-link>
        </div>
      </article>

      <div v-if="rest.length" class="solutions__grid">
        <router-link
          v-for="(product, index) in rest"
          :key="product.slug"
          class="solutions__card"
          :to="lp('/products/' + product.slug)"
        >
          <div class="solutions__card-image">
            <img
              :src="asset(product.heroImage?.url)"
              :alt="product.heroImage?.alternativeText || product.name"
              loading="lazy"
              decoding="async"
              width="640"
              height="420"
            />
          </div>
          <div class="solutions__card-body">
            <span class="solutions__stamp">{{ String(index + 2).padStart(2, "0") }}</span>
            <p v-if="product.category" class="solutions__cat">{{ categoryLabel(product.category) }}</p>
            <h3>{{ product.name }}</h3>
            <p>{{ product.tagline || product.subtitle }}</p>
            <span class="solutions__go">{{ t("products.viewDetails") }}</span>
          </div>
        </router-link>
      </div>

      <div class="solutions__cta">
        <router-link :to="lp('/products')" class="pd-btn">{{ t("products.viewAll") }}</router-link>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useLocalePath } from "../../composables/useLocalePath";
import { useStrapiAsset } from "../../composables/useStrapiAsset";

type ProductCard = {
  slug: string
  name: string
  tagline?: string | null
  subtitle?: string | null
  category?: string | null
  heroImage?: { url: string; alternativeText?: string | null } | null
}

const { t } = useI18n();
const lp = useLocalePath();
const asset = useStrapiAsset();

const { data: products } = await useFetch<ProductCard[]>("/api/products", {
  key: "home-products",
  default: () => [],
});

const featured = computed(() => products.value?.[0] ?? null);
const rest = computed(() => (products.value ?? []).slice(1, 4));

const categoryLabel = (cat: string) => {
  const key = `products.category.${cat}`;
  return t(key) === key ? cat : t(key);
};
</script>

<style scoped>
.solutions__feature {
  display: grid;
  grid-template-columns: 1.15fr .85fr;
  margin-top: 32px;
  border: 1px solid var(--pd-line-strong);
  background: var(--pd-surface);
}
.solutions__feature-media {
  position: relative;
  min-height: 360px;
  background: #07080a;
}
.solutions__feature-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.solutions__feature-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  padding: clamp(24px, 4vw, 48px);
}
.solutions__feature-copy h3 {
  margin: 0 0 12px;
  font-size: clamp(2.6rem, 4vw, 4.2rem);
  line-height: .9;
  text-transform: uppercase;
}
.solutions__feature-copy p:last-of-type {
  margin: 0 0 24px;
  color: var(--pd-ink-soft);
}
.solutions__stamp {
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .16em;
}
.solutions__feature-media .solutions__stamp {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 6px 8px;
  color: var(--pd-accent);
  background: rgba(7, 8, 10, .72);
}
.solutions__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 0;
  border: 1px solid var(--pd-line-strong);
  border-top: 0;
}
.solutions__card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--pd-line);
  background: var(--pd-surface);
  color: inherit;
}
.solutions__card:last-child { border-right: 0; }
.solutions__card:hover { background: color-mix(in srgb, var(--pd-primary) 7%, var(--pd-surface)); }
.solutions__card-image {
  height: 210px;
  overflow: hidden;
  background: var(--pd-bg-soft);
}
.solutions__card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .45s ease;
}
.solutions__card:hover img { transform: scale(1.04); }
.solutions__card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px 18px 22px;
}
.solutions__cat {
  margin: 0;
  color: var(--pd-primary);
  font-family: var(--pd-font-mono);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.solutions__card-body h3 {
  margin: 0;
  font-size: 1.7rem;
  line-height: .95;
  text-transform: uppercase;
}
.solutions__card-body p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  margin: 0;
  color: var(--pd-ink-soft);
  font-size: 14px;
}
.solutions__go {
  margin-top: auto;
  color: var(--pd-primary);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.solutions__cta { margin-top: 28px; }
.solutions__cta .pd-btn { color: var(--pd-ink); border-color: var(--pd-ink); }
.solutions__cta .pd-btn:hover { color: var(--pd-primary); border-color: var(--pd-primary); }

@media (max-width: 980px) {
  .solutions__feature,
  .solutions__grid { grid-template-columns: 1fr; }
  .solutions__card { border-right: 0; border-bottom: 1px solid var(--pd-line); }
  .solutions__card:last-child { border-bottom: 0; }
}
</style>
