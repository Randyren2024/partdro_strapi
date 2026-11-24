<script setup lang="ts">
const props = defineProps<{ section: any }>()

const tableColumns = computed(() => ((props.section.headers ?? []) as string[]).map((header, i) => ({
  title: header,
  dataIndex: `c${i}`,
  key: `c${i}`,
})))

const tableData = computed(() => ((props.section.rows ?? []) as any[]).map((row, r) => {
  const record: Record<string, any> = { key: `r${r}` }
  if (Array.isArray(row)) {
    row.forEach((cell, c) => { record[`c${c}`] = cell })
  }
  return record
}))
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Editions</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <a-table
        v-if="tableColumns.length"
        class="editions-table"
        :columns="tableColumns"
        :data-source="tableData"
        :pagination="false"
        :scroll="{ x: 560 }"
        bordered
        size="middle"
      />

      <div v-if="section.kitList" class="kit">
        <h3>{{ section.kitTitle || 'In the standard kit' }}</h3>
        <p>{{ section.kitList }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editions-table { margin-top: clamp(32px, 5vw, 56px); }
.editions-table :deep(.ant-table-tbody > tr > td:first-child) {
  color: var(--color-text);
  font-weight: 600;
}
.editions-table :deep(.ant-table-thead > tr > th) {
  font-size: var(--font-size-sm);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.kit {
  margin-top: 32px;
  padding: 24px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-bg-container);
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
  border-top: 1px solid var(--color-border-secondary);
  border-right: 1px solid var(--color-border-secondary);
  border-bottom: 1px solid var(--color-border-secondary);
}
.kit h3 { margin: 0 0 8px; font-size: 20px; }
.kit p { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size); line-height: 1.7; }
</style>
