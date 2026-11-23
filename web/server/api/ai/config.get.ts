import { PRESETS, readConfig, toMasked } from '../../utils/aiConfig'

export default defineEventHandler(() => {
  const current = readConfig()
  return {
    ok: true,
    presets: PRESETS.map(({ id, label, provider, baseUrl, defaultModels, hint }) => ({
      id, label, provider, baseUrl, defaultModels, hint,
    })),
    current: toMasked(current),
  }
})
