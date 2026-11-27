<template>
  <div class="lang-switch" role="group" aria-label="Select language">
    <button
      v-for="code in codes"
      :key="code"
      type="button"
      class="lang-switch__btn"
      :class="{ 'is-active': locale === code }"
      :aria-pressed="locale === code"
      @click="changeLang(code)"
    >
      {{ code.toUpperCase() }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { DEFAULT_LOCALE, isLocale } from "../../i18n";
import { stripLocalePrefix, withLocalePrefix } from "../../composables/useLocalePath";

const codes = ["en", "de", "es", "fr"] as const;
const { locale } = useI18n();
const route = useRoute();
const router = useRouter();

const changeLang = (val: string) => {
  const next = isLocale(val) ? val : DEFAULT_LOCALE;
  const target = withLocalePrefix(stripLocalePrefix(route.path), next);
  locale.value = next;
  localStorage.setItem("lang", next);
  document.documentElement.lang = next;
  router.push({ path: target, query: route.query });
};
</script>

<style scoped>
.lang-switch { display: inline-flex; border: 1px solid rgba(244, 241, 234, .2); }
.lang-switch__btn {
  min-width: 32px;
  min-height: 32px;
  padding: 0 6px;
  border: 0;
  border-right: 1px solid rgba(244, 241, 234, .16);
  background: transparent;
  color: rgba(244, 241, 234, .62);
  font-family: var(--pd-font-mono);
  font-size: 10px;
  letter-spacing: .08em;
  cursor: pointer;
}
.lang-switch__btn:last-child { border-right: 0; }
.lang-switch__btn.is-active,
.lang-switch__btn:hover { color: #07080a; background: #f4f1ea; }
</style>
