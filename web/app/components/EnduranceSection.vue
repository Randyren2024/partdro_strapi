<script setup lang="ts">
defineProps<{ section: any }>()
const asset = useStrapiAsset()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Endurance</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <div v-if="section.points?.length" class="curve">
        <div v-for="(p, i) in section.points" :key="p.id" class="curve-col">
          <div class="curve-bar" :style="{ height: `${88 - i * 14}%` }">
            <strong>{{ p.value }}</strong>
          </div>
          <span class="curve-label">{{ p.label }}</span>
        </div>
      </div>

      <figure v-if="section.image" class="curve-media">
        <img :src="asset(section.image.url)" :alt="section.image.alternativeText || section.title" loading="lazy" />
      </figure>

      <p v-if="section.note" class="curve-note">{{ section.note }}</p>
    </div>
  </section>
</template>

<style scoped>
.curve {
  display: flex; align-items: flex-end; gap: clamp(16px, 4vw, 48px);
  height: 240px;
  margin-top: clamp(32px, 5vw, 56px);
  border-bottom: 2px solid var(--ink);
  padding-bottom: 0;
}
.curve-col {
  flex: 1;
  height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  gap: 10px;
}
.curve-bar {
  width: 100%;
  max-width: 180px;
  background: linear-gradient(180deg, var(--accent) 0%, var(--accent-ink) 100%);
  border-radius: 3px 3px 0 0;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12px;
  font-family: var(--font-display); font-stretch: 90%;
  font-size: 26px; font-weight: 700; color: #fff;
  font-variant-numeric: tabular-nums;
  animation: rise 0.7s ease both;
}
@keyframes rise { from { transform: scaleY(0); transform-origin: bottom; } to { transform: scaleY(1); } }
.curve-label { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); padding-bottom: 10px; }

.curve-media { margin: clamp(32px, 5vw, 48px) 0 0; }
.curve-media img { border-radius: 6px; border: 1px solid var(--line); }
.curve-note { margin-top: 20px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); }
</style>
