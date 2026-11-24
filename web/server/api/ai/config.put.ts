import { randomUUID } from 'node:crypto'
import {
  listMasked,
  readConfigFile,
  validateConfig,
  writeConfigFile,
} from '../../utils/aiConfig'

// PUT /api/ai/config
// - { activeId }                      → switch the active config
// - { id?, label, baseUrl, apiKey, model, temperature, presetId }
//                                     → create (no id) or update (id) and make it active
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const file = readConfigFile()

  // Switch-only request.
  if (typeof body.activeId === 'string' && !body.baseUrl && !body.model) {
    const target = file.configs.find((c) => c.id === body.activeId)
    if (!target) throw createError({ statusCode: 404, statusMessage: '配置不存在' })
    file.activeId = target.id
    writeConfigFile(file)
    return { ok: true, ...listMasked(readConfigFile()) }
  }

  const incoming = {
    id: typeof body.id === 'string' ? body.id : undefined,
    label: typeof body.label === 'string' ? body.label.trim() : '',
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '',
    apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : '',
    model: typeof body.model === 'string' ? body.model.trim() : '',
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
    presetId: typeof body.presetId === 'string' ? body.presetId : undefined,
  }

  const existing = incoming.id ? file.configs.find((c) => c.id === incoming.id) : undefined

  // If apiKey is empty, preserve whatever this config had before (don't blank it on save).
  if (!incoming.apiKey && existing?.apiKey) {
    incoming.apiKey = existing.apiKey
  }

  const errors = validateConfig(incoming)
  if (errors.length) {
    throw createError({ statusCode: 400, statusMessage: errors.join(' | ') })
  }

  const cfg = {
    id: existing?.id ?? randomUUID(),
    label: incoming.label,
    baseUrl: incoming.baseUrl,
    apiKey: incoming.apiKey,
    model: incoming.model,
    temperature: incoming.temperature,
    presetId: incoming.presetId,
    updatedAt: new Date().toISOString(),
  }

  file.configs = existing
    ? file.configs.map((c) => (c.id === cfg.id ? cfg : c))
    : [...file.configs, cfg]
  file.activeId = cfg.id
  writeConfigFile(file)

  // Re-read to confirm persistence — and return masked for the client.
  return { ok: true, ...listMasked(readConfigFile()) }
})