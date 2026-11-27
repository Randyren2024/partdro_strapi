// Supabase snapshot store (server-only).
//
// When Strapi is unreachable, the BFF serves the last successfully-assembled
// JSON from a small `web_snapshot` table instead of failing. We talk to Supabase
// through PostgREST with the service role key, so no extra dependency is needed
// and RLS is bypassed (the key is server-side only).
//
// Table (additive; does not touch any Strapi table):
//   create table if not exists web_snapshot (
//     key text primary key,
//     payload jsonb not null,
//     updated_at timestamptz not null default now()
//   );

type SnapshotRow = { payload: unknown }

function supabaseConfig() {
  const config = useRuntimeConfig()
  return {
    url: (config.supabaseUrl || '').replace(/\/$/, ''),
    key: config.supabaseServiceKey || '',
  }
}

function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

// Insert a row into a table (best-effort; throws on failure so callers can 5xx).
export async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  const { url, key: serviceKey } = supabaseConfig()
  if (!url || !serviceKey) throw new Error('Supabase is not configured')
  await $fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(serviceKey), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
    timeout: 8000,
  })
}

// Read a snapshot payload, or null when absent / unreachable. Never throws.
export async function readSnapshot<T = unknown>(key: string): Promise<T | null> {
  const { url, key: serviceKey } = supabaseConfig()
  if (!url || !serviceKey) return null
  try {
    const rows = await $fetch<SnapshotRow[]>(
      `${url}/rest/v1/web_snapshot`,
      {
        query: { key: `eq.${key}`, select: 'payload' },
        headers: headers(serviceKey),
        timeout: 4000,
      },
    )
    return (rows?.[0]?.payload as T) ?? null
  } catch {
    return null
  }
}

// Upsert a snapshot payload. Best-effort: never throws, never blocks a response.
export async function writeSnapshot(key: string, payload: unknown): Promise<void> {
  const { url, key: serviceKey } = supabaseConfig()
  if (!url || !serviceKey) return
  try {
    await $fetch(`${url}/rest/v1/web_snapshot`, {
      method: 'POST',
      headers: {
        ...headers(serviceKey),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key, payload, updated_at: new Date().toISOString() }),
      timeout: 4000,
    })
  } catch {
    // Snapshot writes are an optimization; ignore failures.
  }
}