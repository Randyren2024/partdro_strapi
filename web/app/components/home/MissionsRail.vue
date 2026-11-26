<template>
  <section class="missions section">
    <div class="container">
      <p class="eyebrow">{{ t("nav.products") }}</p>
      <h2 class="section-title">{{ t("products.title") }}</h2>
      <div class="missions__board">
        <NuxtLink
          v-for="(cat, index) in missions"
          :key="cat"
          class="missions__cell"
          :class="{ 'missions__cell--lead': index === 0 }"
          :to="{ path: lp('/products'), query: { category: cat } }"
        >
          <span class="missions__index">{{ String(index + 1).padStart(2, "0") }}</span>
          <span class="missions__name">{{ t(`products.category.${cat}`) }}</span>
          <span class="missions__go">{{ t("products.viewDetails") }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLocalePath } from "../../composables/useLocalePath";

const { t } = useI18n();
const lp = useLocalePath();

const missions = ["multi-mission", "delivery-logistics", "agriculture", "inspection-mapping"] as const;
</script>

<style scoped>
.missions__board {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  margin-top: 28px;
  border: 1px solid var(--pd-line-strong);
  background: var(--pd-surface);
}
.missions__cell {
  position: relative;
  display: flex;
  min-height: 124px;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--pd-line);
  color: var(--pd-ink);
}
.missions__cell:nth-child(n + 2) { border-left: 1px solid var(--pd-line); }
.missions__cell:last-child { border-bottom: 0; }
.missions__cell--lead {
  grid-row: 1 / span 3;
  min-height: 100%;
  border-bottom: 0;
  border-left: 0;
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--pd-primary) 16%, transparent), transparent 52%),
    var(--pd-surface);
}
.missions__cell--lead .missions__name { font-size: clamp(3rem, 5vw, 5.2rem); }
.missions__index {
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .16em;
}
.missions__name {
  max-width: 10ch;
  font-family: var(--pd-font-display);
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: .9;
  text-transform: uppercase;
}
.missions__go {
  color: var(--pd-primary);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.missions__cell:hover { background: color-mix(in srgb, var(--pd-primary) 8%, var(--pd-surface)); }
.missions__cell:hover .missions__name { color: var(--pd-primary); }

@media (max-width: 800px) {
  .missions__board { grid-template-columns: 1fr; }
  .missions__cell--lead { grid-row: auto; min-height: 220px; }
  .missions__cell:nth-child(n + 2) { border-left: 0; }
  .missions__cell--lead { border-bottom: 1px solid var(--pd-line); }
}
</style>
