/**
 * One-off migration: legacy_partdro Supabase (posts/post_langs/inquiries) -> Strapi.
 *
 * Usage (from cms/): node scripts/migrate-legacy-news.mjs
 * Env overrides: LEGACY_DB_URL, STRAPI_URL, STRAPI_TOKEN
 *
 * Idempotent: existing news posts are matched by slug and skipped (their
 * published_at is still backfilled), existing inquiries by email+message.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const ROOT = 'C:/Users/81102/Desktop/partdro';
const IMAGES_DIR = 'C:/Users/81102/Desktop/legacy_partdro/public/images';

const readEnv = (file) =>
  Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );

const webEnv = readEnv(path.join(ROOT, 'web', '.env'));
const cmsEnv = readEnv(path.join(ROOT, 'cms', '.env'));

const LEGACY_DB = process.env.LEGACY_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const STRAPI = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const TOKEN = process.env.STRAPI_TOKEN || webEnv.NUXT_STRAPI_FULL_TOKEN;
const LOCALES = ['de', 'es', 'fr'];

if (!TOKEN) {
  console.error('Missing NUXT_STRAPI_FULL_TOKEN (web/.env)');
  process.exit(1);
}

const jsonHeaders = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const parse = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const strapi = async (p, init = {}) => {
  const res = await fetch(`${STRAPI}${p}`, { ...init, headers: { ...jsonHeaders, ...(init.headers || {}) } });
  const body = await parse(res);
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
  return body;
};

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

async function uploadCover(slug, imageUrl) {
  const ext = path.extname(imageUrl.split('?')[0]).toLowerCase() || '.jpg';
  const filename = `${slug}${ext}`;

  const existing = await strapi(`/api/upload/files?filters[name][$eq]=${encodeURIComponent(filename)}&pagination[pageSize]=1`);
  if (Array.isArray(existing) && existing.length > 0) return existing[0].id;

  let buffer;
  let mime = MIME[ext] || 'image/jpeg';
  if (/^https?:\/\//.test(imageUrl)) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`cover download ${res.status} for ${imageUrl}`);
    buffer = Buffer.from(await res.arrayBuffer());
    mime = res.headers.get('content-type') || mime;
  } else {
    const rel = imageUrl.replace(/^\/images\//, '');
    const file = path.join(IMAGES_DIR, rel);
    if (!fs.existsSync(file)) throw new Error(`cover file missing: ${file}`);
    buffer = fs.readFileSync(file);
  }

  const form = new FormData();
  form.append('files', new Blob([buffer], { type: mime }), filename);
  const res = await fetch(`${STRAPI}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  const body = await parse(res);
  if (!res.ok) throw new Error(`upload ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
  return body[0].id;
}

const loadLegacy = async () => {
  const client = new Client({ connectionString: LEGACY_DB });
  await client.connect();
  const posts = (
    await client.query(`
      select p.id, p.slug, p.category, p.image_url, p.published_at, p.created_at,
        (select json_agg(json_build_object('lang', l.lang, 'title', l.title, 'summary', l.summary, 'content', l.content))
           from post_langs l where l.post_id = p.id) as langs
      from posts p
      order by p.published_at asc
    `)
  ).rows;
  const inquiries = (
    await client.query(`
      select name, email, phone, type, message, created_at, company, country, lead_status, owner, notes,
             quote_value, quote_currency, landing_page, page_path, product_slug, utm_source, utm_medium,
             utm_campaign, lead_profile
      from inquiries order by created_at
    `)
  ).rows;
  await client.end();
  return { posts, inquiries };
};

const main = async () => {
  const { posts, inquiries } = await loadLegacy();
  console.log(`legacy: ${posts.length} posts, ${inquiries.length} inquiries`);

  const errors = [];
  const dates = []; // { documentId, locale, publishedAt, createdAt }
  let created = 0;
  let skipped = 0;

  for (const [index, post] of posts.entries()) {
    const tag = `[${index + 1}/${posts.length}] ${post.slug}`;
    try {
      const en = post.langs.find((l) => l.lang === 'en');
      if (!en) throw new Error('no en translation');

      const existing = await strapi(
        `/api/news-posts?locale=en&status=published&filters[slug][$eq]=${encodeURIComponent(post.slug)}&pagination[pageSize]=1`
      );
      let documentId = existing.data?.[0]?.documentId;

      if (!documentId) {
        let coverId;
        try {
          coverId = await uploadCover(post.slug, post.image_url);
        } catch (e) {
          console.log(`${tag} cover skipped: ${e.message}`);
        }
        const res = await strapi('/api/news-posts?locale=en', {
          method: 'POST',
          body: JSON.stringify({
            data: {
              title: en.title,
              slug: post.slug,
              summary: en.summary,
              content: en.content,
              category: post.category,
              ...(coverId ? { cover: coverId } : {}),
              publishedAt: new Date().toISOString(),
            },
          }),
        });
        documentId = res.data.documentId;
        created += 1;
      } else {
        skipped += 1;
      }

      dates.push({ documentId, locale: 'en', publishedAt: post.published_at, createdAt: post.created_at });

      for (const locale of LOCALES) {
        const lang = post.langs.find((l) => l.lang === locale);
        if (!lang) continue;
        const current = await strapi(`/api/news-posts/${documentId}?locale=${locale}`).catch((e) =>
          String(e.message).includes('-> 404') ? null : Promise.reject(e)
        );
        if (current?.data?.documentId !== documentId) {
          await strapi(`/api/news-posts/${documentId}?locale=${locale}`, {
            method: 'PUT',
            body: JSON.stringify({
              data: {
                title: lang.title,
                slug: post.slug,
                summary: lang.summary,
                content: lang.content,
                category: post.category,
                publishedAt: new Date().toISOString(),
              },
            }),
          });
        }
        dates.push({ documentId, locale, publishedAt: post.published_at, createdAt: post.created_at });
      }

      console.log(`${tag} ok (${created} created / ${skipped} existed)`);
    } catch (e) {
      errors.push(`${post.slug}: ${e.message}`);
      console.log(`${tag} FAILED ${e.message}`);
    }
  }

  // backfill legacy timestamps (REST always forces publishedAt = now)
  const db = new Client({
    connectionString: cmsEnv.DATABASE_URL,
    ssl: cmsEnv.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await db.connect();
  for (const d of dates) {
    await db.query(
      `update news_posts set published_at = $1, created_at = $2, updated_at = $2 where document_id = $3 and locale = $4 and published_at is not null`,
      [d.publishedAt, d.createdAt, d.documentId, d.locale]
    );
  }
  console.log(`backfilled timestamps for ${dates.length} locale rows`);

  let inquiriesCreated = 0;
  const inquiryDates = [];
  for (const inq of inquiries) {
    const same = await strapi(
      `/api/inquiries?filters[email][$eq]=${encodeURIComponent(inq.email)}&pagination[pageSize]=100`
    );
    const exists = (same.data || []).some((r) => r.message === inq.message);
    if (exists) {
      console.log(`inquiry ${inq.email} already exists`);
      continue;
    }
    await strapi('/api/inquiries', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name: inq.name,
          email: inq.email,
          phone: inq.phone || undefined,
          type: ['contact', 'booking', 'franchise'].includes(inq.type) ? inq.type : 'contact',
          message: inq.message,
          page: inq.page_path || undefined,
          productSlug: inq.product_slug || undefined,
          company: inq.company || undefined,
          country: inq.country || undefined,
          leadStatus: inq.lead_status || undefined,
          owner: inq.owner || undefined,
          notes: inq.notes || undefined,
          quoteValue: inq.quote_value === null ? undefined : Number(inq.quote_value),
          quoteCurrency: inq.quote_currency || undefined,
          landingPage: inq.landing_page || undefined,
          utmSource: inq.utm_source || undefined,
          utmMedium: inq.utm_medium || undefined,
          utmCampaign: inq.utm_campaign || undefined,
          leadProfile: inq.lead_profile || undefined,
        },
      }),
    });
    inquiriesCreated += 1;
    inquiryDates.push({ email: inq.email, createdAt: inq.created_at });
  }
  for (const i of inquiryDates) {
    await db.query(`update inquiries set created_at = $1, updated_at = $1 where email = $2`, [i.createdAt, i.email]);
  }
  await db.end();

  console.log(`\ndone: ${created} posts created, ${skipped} already existed, ${inquiriesCreated} inquiries imported`);
  if (errors.length) {
    console.log(`\n${errors.length} errors:`);
    for (const e of errors) console.log(' -', e);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});