<template>
  <div class="news-page">
    <div class="page-header">
      <div class="container">
        <h1>{{ t('news.title') }}</h1>
        <p>{{ t('news.subtitle') }}</p>
      </div>
    </div>
    <div class="page-section">
      <div class="container">
        <div v-if="posts.length" class="news__grid">
          <div class="news__card" v-for="post in posts" :key="post.slug">
            <div class="news__card-image">
              <img
                v-if="post.cover?.url"
                :src="asset(post.cover.url)"
                :alt="post.cover?.alternativeText || post.title"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div class="news__card-body">
              <div class="news__meta">
                <span>{{ post.publishedAt?.slice(0, 10) }}</span>
                <a-tag v-if="post.category">{{ post.category }}</a-tag>
              </div>
              <h3>{{ post.title }}</h3>
              <p>{{ post.summary }}</p>
              <router-link :to="lp(`/news/${post.slug}`)" class="news__link">
                {{ t('news.readMore') }} <RightOutlined />
              </router-link>
            </div>
          </div>
        </div>
        <p v-else class="news__empty">{{ t('news.empty') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RightOutlined } from '@ant-design/icons-vue'
import { useLocalePath } from '~/composables/useLocalePath'
import { useStrapiAsset } from '~/composables/useStrapiAsset'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '~/i18n'

type NewsCard = {
  slug: string
  title: string
  summary: string
  category: string
  publishedAt: string | null
  cover?: { url: string; alternativeText?: string | null } | null
}

const { t, locale } = useI18n()
const lp = useLocalePath()
const asset = useStrapiAsset()

const runtimeConfig = useRuntimeConfig()
const SITE_URL = runtimeConfig.public.siteUrl || 'https://www.droneworld.tech'

const { data: posts } = await useFetch<NewsCard[]>('/api/news', {
  key: 'news-list',
  query: { locale },
  default: () => [],
})

const canonicalUrl = computed(() =>
  locale.value === DEFAULT_LOCALE ? `${SITE_URL}/news` : `${SITE_URL}/${locale.value}/news`,
)

useHead(() => ({
  title: t('news.title'),
  titleTemplate: '%s | Partdro',
  htmlAttrs: { lang: locale.value },
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
    ...SUPPORTED_LOCALES.map((lang) => ({
      rel: 'alternate',
      hreflang: lang,
      href: lang === DEFAULT_LOCALE ? `${SITE_URL}/news` : `${SITE_URL}/${lang}/news`,
    })),
    { rel: 'alternate', hreflang: 'x-default', href: `${SITE_URL}/news` },
  ],
  meta: [
    { name: 'description', content: t('news.subtitle') },
    { name: 'robots', content: 'index, follow, max-image-preview:large' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: t('news.title') },
    { property: 'og:description', content: t('news.subtitle') },
    { property: 'og:url', content: canonicalUrl.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: t('news.title'),
        description: t('news.subtitle'),
        url: canonicalUrl.value,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: posts.value.slice(0, 30).map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}${locale.value === DEFAULT_LOCALE ? '' : `/${locale.value}`}/news/${p.slug}`,
            name: p.title,
          })),
        },
      }),
    },
  ],
}))
</script>

<style scoped>
.news__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(18px, 2.2vw, 28px);
}
.news__card {
  display: grid;
  grid-template-columns: minmax(180px, 38%) minmax(0, 1fr);
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--pd-line);
  border-radius: var(--pd-radius-lg);
  background: var(--pd-surface);
  box-shadow: var(--pd-shadow-sm);
  transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
}
.news__card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--pd-primary) 40%, var(--pd-line));
  box-shadow: var(--pd-shadow);
}
.news__card-image { min-height: 100%; overflow: hidden; background: var(--pd-bg-soft); }
.news__card-image img { display:block; width:100%; height:100%; min-height:230px; object-fit:cover; transition:transform .45s ease; }
.news__card:hover .news__card-image img { transform:scale(1.035); }
.news__card-body { display:flex; min-width:0; flex-direction:column; align-items:flex-start; padding:clamp(18px,2vw,28px); }
.news__meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:14px; color:var(--pd-ink-muted); font-size:12px; }
.news__meta .ant-tag { margin:0; border:0; border-radius:0; color:var(--pd-primary); background:color-mix(in srgb,var(--pd-primary) 10%,var(--pd-surface)); }
.news__card-body h3 { margin:0 0 10px; color:var(--pd-ink); font-family:var(--pd-font-display); font-size:clamp(19px,2vw,24px); font-weight:700; line-height:1.2; letter-spacing:-.02em; }
.news__card-body p { margin:0 0 18px; color:var(--pd-ink-soft); font-size:14px; line-height:1.7; }
.news__link { display:inline-flex; align-items:center; gap:7px; margin-top:auto; color:var(--pd-primary); font-size:14px; font-weight:700; }
.news__link:hover { color:var(--pd-primary-hover); gap:10px; }
.news__empty { padding: 60px 0; color: var(--pd-ink-muted); text-align: center; }
@media(max-width:900px) { .news__grid { grid-template-columns:1fr; } }
@media(max-width:640px) {
 .news__card { grid-template-columns:1fr; }
 .news__card-image img { min-height:0; height:210px; }
 .news__card-body { padding:20px; }
}
</style>