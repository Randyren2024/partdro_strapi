<script setup lang="ts">
defineProps<{ section: any }>()
const asset = useStrapiAsset()

function isVideo(media: any) {
  return media?.mime?.startsWith('video')
}
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Field demo</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <figure v-if="section.media" class="showcase">
        <video v-if="isVideo(section.media)" :src="asset(section.media.url)" controls playsinline />
        <img v-else :src="asset(section.media.url)" :alt="section.media.alternativeText || section.title" loading="lazy" />
        <figcaption v-if="section.caption">{{ section.caption }}</figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.showcase { margin: clamp(32px, 5vw, 56px) 0 0; }
.showcase img,
.showcase video { width: 100%; border-radius: 6px; border: 1px solid var(--line); background: #0c0f12; }
figcaption {
  margin-top: 12px;
  font-family: var(--font-mono); font-size: 12px;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-soft);
}
</style>
