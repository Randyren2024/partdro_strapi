<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">FAQ</p>
      <h2>{{ section.title }}</h2>

      <a-collapse
        v-if="section.items?.length"
        class="faq-list"
        ghost
        accordion
        expand-icon-position="end"
      >
        <a-collapse-panel v-for="item in section.items" :key="item.id" :header="item.question">
          <p>{{ item.answer }}</p>
        </a-collapse-panel>
      </a-collapse>
    </div>
  </section>
</template>

<style scoped>
.faq-list {
  margin-top: clamp(32px, 5vw, 56px);
  border-top: 1px solid var(--color-border-secondary);
}
.faq-list :deep(.ant-collapse-item) {
  border-bottom: 1px solid var(--color-border-secondary);
}
.faq-list :deep(.ant-collapse-header) {
  padding: 20px 4px;
  align-items: center;
}
.faq-list :deep(.ant-collapse-header-text) {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--color-text);
}
.faq-list :deep(.ant-collapse-content-box) {
  padding: 0 40px 22px 4px;
}
.faq-list p {
  margin: 0;
  max-width: 72ch;
  color: var(--color-text-secondary);
  font-size: 15px;
  line-height: 1.7;
}
</style>
