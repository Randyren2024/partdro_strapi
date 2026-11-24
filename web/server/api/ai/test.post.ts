// POST /api/ai/test — send a tiny chat completion to validate a config before saving.
// Body: { id?, baseUrl, apiKey, model, temperature? }
// `id` points at a saved config; empty fields fall back to the stored values so a
// saved config can be tested without re-entering the API key.

import { readConfigFile } from '../../utils/aiConfig'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const stored = typeof body.id === 'string'
    ? readConfigFile().configs.find((c) => c.id === body.id)
    : undefined

  const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl.trim()
    ? body.baseUrl.trim().replace(/\/+$/, '')
    : (stored?.baseUrl ?? '')
  const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim()
    ? body.apiKey.trim()
    : (stored?.apiKey ?? '')
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : (stored?.model ?? '')
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.1

  if (!baseUrl || !model) {
    throw createError({ statusCode: 400, statusMessage: 'baseUrl 和 model 是必填项' })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: 'Reply with a single word: OK.' },
      { role: 'user', content: 'Ping' },
    ],
    max_tokens: 8,
    stream: false,
  }

  let resp: Response
  const start = Date.now()
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `网络错误: ${err?.message ?? err}` })
  }
  const latencyMs = Date.now() - start

  const text = await resp.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch { parsed = { raw: text.slice(0, 300) } }

  if (!resp.ok) {
    const msg = parsed?.error?.message || parsed?.message || `HTTP ${resp.status}`
    return { ok: false, status: resp.status, error: msg, latencyMs }
  }

  const content: string | undefined =
    parsed?.choices?.[0]?.message?.content
    || parsed?.choices?.[0]?.delta?.content
    || undefined

  return {
    ok: true,
    model,
    latencyMs,
    reply: content ? String(content).trim().slice(0, 60) : '(无文本回复)',
  }
})
