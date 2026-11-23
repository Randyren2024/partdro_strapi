// GET /api/ai/models?baseUrl=...&apiKey=...   — proxies /v1/models through the server.
// Never exposes apiKey to the browser: we pass it upstream and only forward {id, owned_by, context_window, description}.

import { H3Event } from 'h3'

export default defineEventHandler(async (event: H3Event) => {
  const { baseUrl, apiKey } = getQuery(event) as { baseUrl?: string; apiKey?: string }

  if (!baseUrl) throw createError({ statusCode: 400, statusMessage: 'baseUrl is required' })
  const normalized = String(baseUrl).replace(/\/+$/, '')

  // For local Ollama without auth, tolerate missing key.
  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (apiKey && String(apiKey).trim()) {
    headers['Authorization'] = `Bearer ${String(apiKey).trim()}`
  }
  // Some providers also honor x-api-key.
  if (apiKey && String(apiKey).trim() && !normalized.includes('ollama')) {
    headers['x-api-key'] = String(apiKey).trim()
  }

  const upstream = `${normalized}/models`
  let resp: Response
  try {
    resp = await fetch(upstream, { method: 'GET', headers })
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `无法连接 ${normalized}: ${err?.message ?? err}` })
  }

  const text = await resp.text()
  let parsed: any
  try { parsed = JSON.parse(text) } catch {
    throw createError({ statusCode: 502, statusMessage: `上游返回非 JSON (${resp.status})` })
  }

  if (!resp.ok) {
    const msg = parsed?.error?.message || parsed?.message || text.slice(0, 200)
    throw createError({ statusCode: resp.status, statusMessage: msg })
  }

  const data: any[] = parsed.data ?? []
  const models = data.map((m) => ({
    id: m.id,
    owned_by: m.owned_by || null,
    context_window: m.context_window || null,
  }))

  return { ok: true, models, rawCount: models.length }
})
