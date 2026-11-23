export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  runtimeConfig: {
    // server-side only: never exposed to the browser
    strapiToken: '',
    public: {
      // used to build media URLs (uploads) in components
      strapiUrl: 'http://localhost:1337',
    },
  },
})
