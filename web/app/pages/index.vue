<template>
  <div class="home-page">
    <HeroBanner />
    <CompanyStats />
    <MissionsRail />
    <ProductSolutions />
    <LatestNews />
  </div>
</template>

<script setup lang="ts">
import HeroBanner from '~/components/home/HeroBanner.vue'
import CompanyStats from '~/components/home/CompanyStats.vue'
import ProductSolutions from '~/components/home/ProductSolutions.vue'
import LatestNews from '~/components/home/LatestNews.vue'
import { useSeo } from '~/composables/useSeo'

const { t } = useI18n()

useSeo({
  title: () => t('meta.home.title'),
  description: () => t('meta.home.description'),
  path: '/',
})
</script>