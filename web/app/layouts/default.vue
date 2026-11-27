<template>
  <div class="default-layout">
    <Header />
    <main>
      <slot />
    </main>
    <Footer />
  </div>
</template>

<script setup lang="ts">
import Header from '../components/layout/Header.vue'
import Footer from '../components/layout/Footer.vue'

// Site-wide structured data: Organization + WebSite (with internal search).
// Page-specific JSON-LD (Product / Article / Breadcrumb) is added per page via useSeo().
const config = useRuntimeConfig()
const SITE_URL = (config.public.siteUrl || 'https://www.droneworld.tech').replace(/\/$/, '')

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${SITE_URL}/#organization`,
            name: 'Partdro',
            alternateName: 'Drone World Tech',
            url: SITE_URL,
            logo: `${SITE_URL}/partdro_favicon.png`,
          },
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: 'Partdro',
            url: SITE_URL,
            publisher: { '@id': `${SITE_URL}/#organization` },
            inLanguage: ['en', 'de', 'es', 'fr'],
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      }),
    },
  ],
})
</script>

<style scoped>
.default-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
main {
  flex: 1;
}
</style>
