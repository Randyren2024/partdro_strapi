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
import HeroBanner from "~/components/home/HeroBanner.vue";
import CompanyStats from "~/components/home/CompanyStats.vue";
import MissionsRail from "~/components/home/MissionsRail.vue";
import ProductSolutions from "~/components/home/ProductSolutions.vue";
import LatestNews from "~/components/home/LatestNews.vue";
</script>
