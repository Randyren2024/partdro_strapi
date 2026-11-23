<script setup lang="ts">
defineProps<{ section: any }>()
const asset = useStrapiAsset()
</script>

<template>
  <section class="section" :class="{ 'section--dark': section.eyebrow === 'Safety' }">
    <div class="container">
      <p v-if="section.eyebrow" class="eyebrow">{{ section.eyebrow }}</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <figure v-if="section.image" class="block-media">
        <img :src="asset(section.image.url)" :alt="section.image.alternativeText || section.title" loading="lazy" />
      </figure>

      <ol v-if="section.items?.length" class="items">
        <li v-for="(item, i) in section.items" :key="item.id" class="item">
          <figure v-if="item.image" class="item-media">
            <img :src="asset(item.image.url)" :alt="item.image.alternativeText || item.title" loading="lazy" />
          </figure>
          <div class="item-main">
            <span class="item-num">{{ String(i + 1).padStart(2, '0') }}</span>
            <div class="item-head">
              <h3>{{ item.title }}</h3>
              <span v-if="item.spec" class="chip">{{ item.spec }}</span>
            </div>
            <p v-if="item.description" class="item-desc">{{ item.description }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.block-media { margin: clamp(28px, 4vw, 48px) 0 0; }
.block-media img { border-radius: 6px; border: 1px solid var(--line); }

.items {
  list-style: none;
  margin: clamp(32px, 5vw, 56px) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
.item {
  background: var(--paper);
  display: flex;
  flex-direction: column;
  padding: 0;
}
.section--dark .item { background: #14181d; }
.item-media { margin: 0; overflow: hidden; background: #e8e5dd; }
.item-media img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.item-main { padding: 22px 24px 26px; }
.item-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.item-num {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent-ink);
  display: block;
  margin-bottom: 8px;
}
.section--dark .item-num { color: var(--accent); }
.item-head h3 { margin: 0; }
.item-desc { margin: 8px 0 0; font-size: 14px; color: var(--ink-soft); }
.section--dark .item-desc { color: rgba(244, 242, 236, 0.65); }
</style>
