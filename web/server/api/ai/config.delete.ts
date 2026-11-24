import { listMasked, readConfigFile, writeConfigFile } from '../../utils/aiConfig'

// DELETE /api/ai/config?id=<config id>
export default defineEventHandler((event) => {
  const { id } = getQuery(event) as { id?: string }
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id 是必填项' })

  const file = readConfigFile()
  const next = file.configs.filter((c) => c.id !== id)
  if (next.length === file.configs.length) {
    throw createError({ statusCode: 404, statusMessage: '配置不存在' })
  }

  file.configs = next
  if (file.activeId === id || !next.some((c) => c.id === file.activeId)) {
    file.activeId = next[0]?.id ?? null
  }
  writeConfigFile(file)

  return { ok: true, ...listMasked(readConfigFile()) }
})