import { randomUUID } from 'node:crypto'
import { readConfig, validateConfig, writeConfig } from '../../utils/aiConfig'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const incoming = {
    id: typeof body.id === 'string' ? body.id : undefined,
    label: typeof body.label === 'string' ? body.label.trim() : '',
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '',
    apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : '',
    model: typeof body.model === 'string' ? body.model.trim() : '',
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
    presetId: typeof body.presetId === 'string' ? body.presetId : undefined,
  }

  // If apiKey is empty, preserve whatever we had before (don't blank it on accidental save).
  const existing = readConfig()
  if (!incoming.apiKey && existing?.apiKey) {
    incoming.apiKey = existing.apiKey
  }

  const errors = validateConfig(incoming)
  if (errors.length) {
    throw createError({ statusCode: 400, statusMessage: errors.join(' | ') })
  }

  const cfg = {
    id: incoming.id || randomUUID(),
    label: incoming.label,
    baseUrl: incoming.baseUrl,
    apiKey: incoming.apiKey,
    model: incoming.model,
    temperature: incoming.temperature,
    presetId: incoming.presetId,
    updatedAt: new Date().toISOString(),
  }

  writeConfig(cfg)

  // Re-read to confirm persistence — and return masked for the client.
  const saved = readConfig()
  return { ok: true, current: saved ? { ...saved, apiKey: maskKey(saved.apiKey), hasKey: !!saved.apiKey } : null }
})

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••'
  const prefix = key.startsWith('sk-') ? 'sk-' : key.slice(0, 4)
  const suffix = key.slice(-4)
  return `${prefix}••••${suffix}`
}
