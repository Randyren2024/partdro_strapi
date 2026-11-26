export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },

  modules: ['@nuxtjs/i18n', '@nuxtjs/color-mode', '@ant-design-vue/nuxt'],

  antd: {
    // Inject AntD CSS-in-JS styles during SSR to avoid a first-paint flash.
    extractStyle: true,
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
  },

  css: [
    'ant-design-vue/dist/reset.css',
    '~/assets/css/variables.css',
    '~/assets/css/global.css',
    '~/assets/css/theme.css',
  ],

  app: {
    head: {
      titleTemplate: '%s | Partdro — Drone Cleaning & Delivery Solutions',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#07080a' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/partdro_favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    // server-side only: never exposed to the browser
    strapiToken: '',
    public: {
      // used to build media URLs (uploads) in components
      strapiUrl: 'http://localhost:1337',
      // canonical / JSON-LD base URL
      siteUrl: 'https://www.droneworld.tech',
    },
  },

  i18n: {
    locales: [
      { code: 'en', language: 'en-US', name: 'English' },
      { code: 'de', language: 'de-DE', name: 'Deutsch' },
      { code: 'es', language: 'es-ES', name: 'Español' },
      { code: 'fr', language: 'fr-FR', name: 'Français' },
    ],
    restructureDir: 'app/i18n',
    vueI18n: './i18n.config.ts',
    defaultLocale: 'en',
    fallbackLocale: 'en',
    strategy: 'prefix_except_default',
    lazy: false,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },
})