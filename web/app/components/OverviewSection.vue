<script setup lang="ts">
defineProps<{ section: any }>()
const asset = useStrapiAsset()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Overview</p>
      <h2>{{ section.title }}</h2>
      <div class="split">
        <div class="split-copy">
          <p class="body-text">{{ section.body }}</p>
          <div v-if="section.stats?.length" class="stat-grid">
            <div v-for="s in section.stats" :key="s.id" class="stat">
              <strong>{{ s.value }}</strong>
              <span>{{ s.label }}</span>
            </div>
          </div>
        </div>
        <figure v-if="section.image" class="split-media">
          <img :src="asset(section.image.url)" :alt="section.image.alternativeText || section.title" loading="lazy" />
        </figure>
      </div>
    </div>
  </section>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(28px, 5vw, 64px);
  align-items: center;
  margin-top: clamp(28px, 4vw, 48px);
}
.split-copy .body-text { margin: 0 0 28px; }
.split-media { margin: 0; }
.split-media img { border-radius: var(--radius-lg); border: 1px solid var(--color-border-secondary); }
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 18px;
  border-top: 1px solid var(--color-border-secondary);
  padding-top: 20px;
}
.stat strong {
  display: block;
  font-family: var(--font-family);
  font-size: 30px; font-weight: 600; line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat span {
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--color-text-tertiary);
}
@media (max-width: 800px) { .split { grid-template-columns: 1fr; } }
</style>
