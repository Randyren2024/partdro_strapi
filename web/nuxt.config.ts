export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },

  modules: ['@nuxtjs/i18n', '@nuxtjs/color-mode', '@ant-design-vue/nuxt', '@nuxtjs/robots', '@nuxtjs/sitemap'],

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

  // Cloudflare Workers build (only when CF=1). Local `npm run build` stays
  // node-server. `deployConfig` makes Nitro emit a ready wrangler config, and
  // `nodeCompat` provides the Node builtins the server routes expect.
  nitro: process.env.CF === '1'
    ? {
        preset: 'cloudflare_module',
        cloudflare: { deployConfig: true, nodeCompat: true },
      }
    : {},

  runtimeConfig: {
    // server-side only: never exposed to the browser
    strapiToken: '',
    // Supabase fallback snapshot store (server-only). Used by server/utils/supabase.ts
    // when Strapi is unreachable. The service role key bypasses RLS - keep it here,
    // never under `public`.
    supabaseUrl: '',
    supabaseServiceKey: '',
    // When true (e.g. the Cloudflare deployment with no reachable Strapi), reads
    // go straight to the Supabase snapshot and never attempt Strapi.
    strapiDisabled: false,
    public: {
      // used to build media URLs (uploads) in components
      strapiUrl: 'http://localhost:1337',
      // canonical / JSON-LD base URL
      siteUrl: 'https://www.droneworld.tech',
      // Google Search Console ownership verification token (content attribute).
      // Set NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION at build/runtime; empty = omit.
      googleSiteVerification: '',
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
    // Required so useLocaleHead() emits absolute hreflang/canonical URLs.
    baseUrl: 'https://www.droneworld.tech',
    lazy: false,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },

  // robots.txt — disallow private/utility routes, point crawlers at the sitemap.
  robots: {
    disallow: ['/ingest', '/api/'],
    sitemap: 'https://www.droneworld.tech/sitemap.xml',
  },

  // sitemap.xml — @nuxtjs/sitemap reads @nuxtjs/i18n locales and emits one
  // <url> per locale with xhtml:link hreflang alternates automatically.
  // Dynamic product/news URLs are supplied by the server sources below.
  sitemap: {
    siteUrl: 'https://www.droneworld.tech',
    autoLastmod: true,
    // Discover dynamic routes from the BFF. Each source returns
    // [{ url, lastmod?, loc?, ... }] and the module localizes them per locale.
    sources: ['/api/sitemap/urls'],
    defaults: {
      changefreq: 'weekly',
      priority: 0.7,
    },
  },
})