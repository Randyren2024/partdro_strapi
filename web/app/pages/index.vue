<script setup lang="ts">
const { data: products } = await useFetch('/api/products') as any

useSeoMeta({
  title: 'Partdro — Multi-mission drone platforms',
  description: 'Professional multi-mission drone systems for inspection, delivery and environmental sampling.',
})

const asset = useStrapiAsset()
</script>

<template>
  <div>
    <section class="section intro">
      <div class="container">
        <p class="eyebrow">Product index</p>
        <h2>Multi-mission drone platforms</h2>
        <p class="body-text">One airframe, many roles. Payload-defined platforms for inspection, logistics and environmental work.</p>
      </div>
    </section>

    <section class="section catalog">
      <div class="container grid">
        <NuxtLink
          v-for="p in products ?? []"
          :key="p.slug"
          :to="`/products/${p.slug}`"
          class="card"
        >
          <div class="card-media">
            <img
              v-if="p.heroImage"
              :src="asset(p.heroImage.url)"
              :alt="p.heroImage.alternativeText || p.name"
              loading="lazy"
            />
          </div>
          <div class="card-body">
            <span class="card-code">{{ p.code }}<template v-if="p.tagline"> · {{ p.tagline }}</template></span>
            <h3>{{ p.name }}</h3>
            <p>{{ p.subtitle }}</p>
            <span class="card-cta">View platform →</span>
          </div>
        </NuxtLink>
        <p v-if="products && !products.length" class="body-text">
          No products yet — publish one in the Strapi admin or run the import script.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { padding-top: clamp(64px, 10vw, 120px); }

.catalog { padding-top: 0; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}
.card {
  display: flex; flex-direction: column;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  text-decoration: none; color: inherit;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.card:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(12, 15, 18, 0.12); }
.card-media { aspect-ratio: 16 / 10; background: #e8e5dd; overflow: hidden; }
.card-media img { width: 100%; height: 100%; object-fit: cover; }
.card-body { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.card-code { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-ink); }
.card-body h3 { font-size: 22px; }
.card-body p { margin: 0; color: var(--ink-soft); font-size: 14px; }
.card-cta { margin-top: auto; padding-top: 12px; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.12em; color: var(--ink); }
</style>
