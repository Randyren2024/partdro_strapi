<script setup lang="ts">
defineProps<{ section: any }>()
</script>

<template>
  <section class="section">
    <div class="container">
      <p class="eyebrow">Editions</p>
      <h2>{{ section.title }}</h2>
      <p v-if="section.description" class="body-text">{{ section.description }}</p>

      <div v-if="section.headers?.length" class="table-wrap">
        <table class="editions-table">
          <thead>
            <tr>
              <th v-for="(h, i) in section.headers" :key="i">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in section.rows ?? []" :key="r">
              <td v-for="(cell, c) in row" :key="c" :class="{ 'row-label': c === 0 }">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="section.kitList" class="kit">
        <h3>{{ section.kitTitle || 'In the standard kit' }}</h3>
        <p>{{ section.kitList }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.table-wrap { margin-top: clamp(32px, 5vw, 56px); overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--card); }
.editions-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 560px; }
.editions-table th {
  text-align: left;
  font-family: var(--font-mono); font-size: 12px;
  letter-spacing: 0.12em; text-transform: uppercase;
  padding: 16px 20px;
  border-bottom: 2px solid var(--ink);
  background: var(--paper);
}
.editions-table td { padding: 13px 20px; border-bottom: 1px solid var(--line); color: var(--ink-soft); }
.editions-table tr:last-child td { border-bottom: none; }
.editions-table td.row-label { color: var(--ink); font-weight: 600; }

.kit {
  margin-top: 32px;
  padding: 24px;
  border-left: 3px solid var(--accent);
  background: var(--card);
  border-radius: 0 6px 6px 0;
  border-top: 1px solid var(--line);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.kit h3 { margin: 0 0 8px; }
.kit p { margin: 0; color: var(--ink-soft); font-size: 14px; }
</style>
