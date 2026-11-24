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
        <a-image
          v-else
          :src="asset(section.media.url)"
          :alt="section.media.alternativeText || section.title"
          class="showcase-image"
        />
        <figcaption v-if="section.caption">{{ section.caption }}</figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.showcase { margin: clamp(32px, 5vw, 56px) 0 0; }
.showcase video {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-secondary);
  background: var(--color-bg-dark);
}
.showcase-image {
  display: block;
  width: 100%;
}
.showcase-image :deep(.ant-image-img) {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-secondary);
}
figcaption {
  margin-top: 12px;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
</style>
