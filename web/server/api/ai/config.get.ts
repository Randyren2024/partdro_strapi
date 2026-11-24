import { PRESETS, listMasked } from '../../utils/aiConfig'

export default defineEventHandler(() => {
  return {
    ok: true,
    presets: PRESETS.map(({ id, label, provider, baseUrl, defaultModels, hint }) => ({
      id, label, provider, baseUrl, defaultModels, hint,
    })),
    ...listMasked(),
  }
})