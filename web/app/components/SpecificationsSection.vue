<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Specifications</p>
      <h2>{{ section.title }}</h2>

      <dl v-if="section.rows?.length" class="spec-sheet">
        <div v-for="(row, index) in section.rows" :key="row.id" class="spec-row">
          <dt>
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            {{ row.label }}
          </dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.spec-sheet {
  margin: clamp(28px, 4vw, 48px) 0 0;
  border-top: 1px solid var(--pd-line-strong);
}
.spec-row {
  display: grid;
  grid-template-columns: minmax(140px, 34%) 1fr;
  gap: 18px;
  align-items: baseline;
  padding: 16px 0;
  border-bottom: 1px solid var(--pd-line);
}
.spec-row dt {
  display: flex;
  gap: 12px;
  margin: 0;
  color: var(--pd-ink-soft);
  font-family: var(--pd-font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.spec-row dt span { color: var(--pd-accent); }
.spec-row dd {
  margin: 0;
  color: var(--pd-ink);
  font-family: var(--pd-font-display);
  font-size: clamp(1.4rem, 2vw, 1.8rem);
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
  line-height: 1.1;
}
@media (max-width: 640px) {
  .spec-row { grid-template-columns: 1fr; gap: 4px; }
}
</style>
