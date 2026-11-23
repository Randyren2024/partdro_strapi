<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">FAQ</p>
      <h2>{{ section.title }}</h2>

      <div v-if="section.items?.length" class="faq-list">
        <details v-for="item in section.items" :key="item.id" class="faq-item">
          <summary>{{ item.question }}</summary>
          <p>{{ item.answer }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.faq-list { margin-top: clamp(32px, 5vw, 56px); border-top: 1px solid var(--line); }
.faq-item { border-bottom: 1px solid var(--line); }
.faq-item summary {
  cursor: pointer;
  padding: 20px 4px;
  font-family: var(--font-display); font-stretch: 94%;
  font-size: 17px; font-weight: 600;
  list-style: none;
  position: relative;
  padding-right: 40px;
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after {
  content: '+';
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono); font-size: 20px;
  color: var(--accent-ink);
  transition: transform 0.15s ease;
}
.faq-item[open] summary::after { content: '−'; }
.faq-item p { margin: 0; padding: 0 40px 22px 4px; color: var(--ink-soft); font-size: 15px; max-width: 72ch; }
</style>
