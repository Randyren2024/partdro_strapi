// One-off / setup helper: create the additive tables the BFF uses.
//   web_snapshot   - fallback JSON cache read when Strapi is unreachable.
//   web_inquiries  - contact-form submissions (written from the live site).
// Safe to re-run; does not touch any Strapi table. Requires `pg` (present under
// cms/node_modules).
//
// Usage:  node web/scripts/create-snapshot-table.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..') // web/scripts -> repo root
const require = createRequire(resolve(root, 'cms/package.json'))
const { Client } = require('pg')

const env = readFileSync(resolve(root, 'cms/.env'), 'utf8')
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim()
if (!url) throw new Error('DATABASE_URL not found in cms/.env')

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query(`
  create table if not exists web_snapshot (
    key text primary key,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
`)
await client.query(`
  create table if not exists web_inquiries (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    phone text,
    type text not null default 'contact',
    message text not null,
    page text,
    product_slug text,
    created_at timestamptz not null default now()
  );
`)
const res = await client.query(
  `select table_name, column_name, data_type from information_schema.columns
   where table_schema='public' and table_name in ('web_snapshot','web_inquiries')
   order by table_name, ordinal_position;`,
)
console.log('tables:', res.rows)
await client.end()