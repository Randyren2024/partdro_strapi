<template>
  <div class="news-detail" v-if="post">
    <div class="page-header">
      <div class="container">
        <h1>{{ post.title }}</h1>
        <p>
          <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ formatDate(post.publishedAt) }}</time>
          <span v-if="post.category"> · {{ post.category }}</span>
        </p>
      </div>
    </div>
    <div class="page-section">
      <div class="container article-container">
        <img
          v-if="post.cover?.url"
          :src="asset(post.cover.url)"
          :alt="post.cover.alternativeText || post.title"
          class="article-hero-image"
          width="1200"
          height="630"
        />
        <div class="article-content">
          <p v-if="post.summary">{{ post.summary }}</p>
          <div v-html="post.content" />
        </div>
        <section v-if="related.length" class="related-articles">
          <h2 class="related-articles__title">{{ t('news.relatedArticles') }}</h2>
          <ul class="related-articles__list">
            <li v-for="p in related" :key="p.slug">
              <router-link :to="lp(`/news/${p.slug}`)" class="related-articles__link">{{ p.title }}</router-link>
              <span class="related-articles__date">{{ p.publishedAt?.slice(0, 10) }}</span>
            </li>
          </ul>
        </section>
        <router-link :to="lp('/news')" class="article-back-link">
          <LeftOutlined /> {{ t('news.backToNews') }}
        </router-link>
      </div>
    </div>
  </div>
  <div v-else class="page-section container">
    <p v-if="pending" role="status">{{ t('news.loading') }}</p>
    <template v-else>
      <p role="status">{{ t('news.notFound') }}</p>
      <router-link :to="lp('/news')" class="article-back-link">{{ t('news.backToNews') }}</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LeftOutlined } from '@ant-design/icons-vue'
import { useLocalePath } from '~/composables/useLocalePath'
import { useStrapiAsset } from '~/composables/useStrapiAsset'
import { DEFAULT_LOCALE } from '~/i18n'

type NewsArticle = {
  slug: string
  title: string
  summary: string
  content: string
  category: string
  publishedAt: string | null
  cover?: { url: string; alternativeText?: string | null } | null
}

type NewsCard = {
  slug: string
  title: string
  category: string
  publishedAt: string | null
}

const runtimeConfig = useRuntimeConfig()
const SITE_URL = runtimeConfig.public.siteUrl || 'https://www.droneworld.tech'
const route = useRoute()
const slug = route.params.slug as string
const { t, locale } = useI18n()
const lp = useLocalePath()
const asset = useStrapiAsset()

const { data: post, pending } = await useFetch<NewsArticle>(`/api/news/${slug}`, {
  key: `news-article:${slug}`,
  query: { locale },
})

const { data: relatedPosts } = await useFetch<NewsCard[]>('/api/news', {
  key: `news-related:${slug}`,
  query: { limit: 4, locale },
  default: () => [],
})

const related = computed(() =>
  (relatedPosts.value ?? []).filter((p) => p.slug !== slug).slice(0, 3),
)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

const absUrl = (u?: string | null) =>
  u ? (u.startsWith('http') ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`) : undefined

const heroImage = computed(() => absUrl(asset(post.value?.cover?.url)))

const metaDescription = computed(() => {
  const p = post.value
  if (!p) return 'Partdro drone industry news and product updates.'
  if (p.summary) return p.summary
  return p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155)
})

const canonicalUrl = computed(() =>
  `${SITE_URL}${locale.value === DEFAULT_LOCALE ? '' : `/${locale.value}`}/news/${slug}`,
)

useHead(() => ({
  title: post.value ? `${post.value.title} | Partdro` : 'News | Partdro',
  titleTemplate: '%s',
  htmlAttrs: { lang: locale.value },
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
    { rel: 'alternate', hreflang: 'x-default', href: `${SITE_URL}/news/${slug}` },
  ],
  meta: [
    { name: 'description', content: metaDescription.value },
    { name: 'robots', content: post.value ? 'index, follow, max-image-preview:large' : 'noindex, follow' },
    { property: 'og:type', content: 'article' },
    { property: 'og:site_name', content: 'Partdro' },
    { property: 'og:title', content: post.value?.title ?? 'News' },
    { property: 'og:description', content: metaDescription.value },
    { property: 'og:url', content: canonicalUrl.value },
    ...(heroImage.value ? [{ property: 'og:image', content: heroImage.value }] : []),
    { name: 'twitter:card', content: heroImage.value ? 'summary_large_image' : 'summary' },
    ...(post.value?.publishedAt
      ? [{ property: 'article:published_time', content: post.value.publishedAt }]
      : []),
    ...(post.value?.category ? [{ property: 'article:section', content: post.value.category }] : []),
  ],
  script: post.value
    ? [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: post.value.title,
                description: metaDescription.value,
                url: canonicalUrl.value,
                ...(heroImage.value ? { image: [heroImage.value] } : {}),
                ...(post.value.publishedAt
                  ? { datePublished: post.value.publishedAt, dateModified: post.value.publishedAt }
                  : {}),
                ...(post.value.category ? { articleSection: post.value.category } : {}),
                author: { '@type': 'Organization', name: 'Partdro', url: SITE_URL },
                publisher: { '@type': 'Organization', name: 'Partdro', url: SITE_URL },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
                  { '@type': 'ListItem', position: 2, name: 'News', item: `${SITE_URL}/news` },
                  { '@type': 'ListItem', position: 3, name: post.value.title, item: canonicalUrl.value },
                ],
              },
            ],
          }),
        },
      ]
    : [],
}))
</script>

<style scoped>
.article-container { max-width:860px; }
.article-hero-image { display:block; width:100%; max-height:520px; object-fit:cover; border:1px solid var(--pd-line); border-radius:var(--pd-radius-lg); margin-bottom:clamp(26px,4vw,42px); box-shadow:var(--pd-shadow-sm); }
.article-content { color:var(--pd-ink); font-size:16px; line-height:1.85; overflow-wrap:anywhere; }
.article-content :deep(> p:first-child) { color:var(--pd-ink-soft); font-size:18px; line-height:1.75; }
.article-content :deep(h2), .article-content :deep(h3) { margin:2em 0 .7em; color:var(--pd-ink); font-family:var(--pd-font-display); line-height:1.2; }
.article-content :deep(p), .article-content :deep(ul), .article-content :deep(ol) { margin:0 0 1.2em; }
.article-content :deep(a) { color:var(--pd-primary); text-decoration:underline; text-underline-offset:3px; }
.article-content :deep(img), .article-content :deep(video), .article-content :deep(iframe) { max-width:100%; border-radius:12px; }
.article-content :deep(blockquote) { margin:1.5em 0; padding:16px 20px; border-left:3px solid var(--pd-primary); background:var(--pd-bg-soft); color:var(--pd-ink-soft); }
.related-articles { margin-top:clamp(42px,6vw,64px); padding-top:30px; border-top:1px solid var(--pd-line); }
.related-articles__title { margin:0 0 20px; color:var(--pd-ink); font-family:var(--pd-font-display); font-size:26px; }
.related-articles__list { display:grid; gap:0; margin:0; padding:0; list-style:none; }
.related-articles__list li { display:flex; justify-content:space-between; gap:18px; padding:14px 0; border-bottom:1px solid var(--pd-line); }
.related-articles__link { color:var(--pd-ink); font-weight:650; }
.related-articles__link:hover { color:var(--pd-primary); }
.related-articles__date { flex:0 0 auto; color:var(--pd-ink-muted); font-size:12px; }
.article-back-link { display:inline-flex; align-items:center; gap:8px; margin-top:34px; color:var(--pd-primary); font-weight:700; }
@media(max-width:640px) {
 .article-container { width:min(var(--pd-container),calc(100% - 32px)); }
 .related-articles__list li { flex-direction:column; gap:4px; }
 .article-content { font-size:15px; }
}
</style>