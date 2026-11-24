<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Specifications</p>
      <h2>{{ section.title }}</h2>

      <a-descriptions
        v-if="section.rows?.length"
        class="spec-list"
        :column="1"
        bordered
        size="middle"
        :label-style="{ width: '32%' }"
      >
        <a-descriptions-item v-for="row in section.rows" :key="row.id" :label="row.label">
          {{ row.value }}
        </a-descriptions-item>
      </a-descriptions>
    </div>
  </section>
</template>

<style scoped>
.spec-list { margin-top: clamp(32px, 5vw, 56px); }
.spec-list :deep(.ant-descriptions-item-content) { font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .spec-list :deep(.ant-descriptions-item-label) { width: 42% !important; }
}
</style>
