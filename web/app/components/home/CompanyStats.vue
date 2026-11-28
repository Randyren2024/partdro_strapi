<template>
  <section class="stats" aria-label="Company figures">
    <div class="container stats__grid">
      <div class="stats__item" v-for="(item, index) in statsData" :key="item.key">
        <span class="stats__index">{{ String(index + 1).padStart(2, "0") }}</span>
        <div class="stats__number">{{ item.value }}+</div>
        <div class="stats__label" :data-edit-key="`stats.${item.key}`">{{ t(`stats.${item.key}`) }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const statsData = [
  { key: "countries", value: 80 },
  { key: "years", value: 12 },
  { key: "patents", value: 10 },
  { key: "team", value: 100 },
];
</script>

<style scoped>
.stats {
  color: #f4f1ea;
  background: #07080a;
  border-block: 1px solid rgba(244, 241, 234, .12);
}
.stats__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
.stats__item {
  position: relative;
  padding: 28px 22px 26px;
  border-right: 1px solid rgba(244, 241, 234, .12);
}
.stats__item:last-child { border-right: 0; }
.stats__index {
  color: var(--pd-accent);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .16em;
}
.stats__number {
  margin: 10px 0 6px;
  color: #f4f1ea;
  font-family: var(--pd-font-display);
  font-size: clamp(3.4rem, 5vw, 5rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.04em;
  line-height: .85;
}
.stats__label {
  max-width: 12rem;
  color: rgba(244, 241, 234, .62);
  font-family: var(--pd-font-mono);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
}
@media (max-width: 800px) {
  .stats__grid { grid-template-columns: 1fr 1fr; }
  .stats__item:nth-child(2) { border-right: 0; }
  .stats__item:nth-child(-n + 2) { border-bottom: 1px solid rgba(244, 241, 234, .12); }
}
</style>
