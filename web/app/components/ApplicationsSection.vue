<script setup lang="ts">
defineProps<{ section: any }>()
const asset = useStrapiAsset()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Applications</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <div v-if="section.items?.length" class="app-grid">
        <div v-for="item in section.items" :key="item.id" class="app-card">
          <div v-if="item.image" class="app-media">
            <img :src="asset(item.image.url)" :alt="item.image.alternativeText || item.title" loading="lazy" />
          </div>
          <div class="app-body">
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  margin-top: clamp(32px, 5vw, 56px);
}
.app-card {
  background: var(--color-bg-container);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--box-shadow-tertiary);
  overflow: hidden;
  transition:
    box-shadow var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
}
.app-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--box-shadow);
}
.app-media { aspect-ratio: 16 / 10; overflow: hidden; background: var(--color-border-secondary); }
.app-media img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
.app-card:hover .app-media img { transform: scale(1.04); }
.app-body { padding: 18px 20px 22px; }
.app-body h3 { margin: 0 0 8px; font-size: 18px; line-height: 1.4; }
.app-body p { margin: 0; font-size: var(--font-size); color: var(--color-text-secondary); line-height: 1.7; }
</style>
