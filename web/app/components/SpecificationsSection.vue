<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Specifications</p>
      <h2>{{ section.title }}</h2>

      <dl v-if="section.rows?.length" class="spec-list">
        <div v-for="row in section.rows" :key="row.id" class="spec-row">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.spec-list { margin: clamp(32px, 5vw, 56px) 0 0; border-top: 1px solid var(--line); }
.spec-row {
  display: grid;
  grid-template-columns: minmax(180px, 34%) 1fr;
  gap: 16px;
  padding: 14px 4px;
  border-bottom: 1px solid var(--line);
}
.spec-row dt { font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); padding-top: 2px; }
.spec-row dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) { .spec-row { grid-template-columns: 1fr; gap: 2px; } }
</style>
