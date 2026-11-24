// AI model configuration shared across server routes.
// Stores presets + all saved configs on disk in scripts/ingest/ai_config.json
// so both the Nuxt frontend and the Python ingest.py CLI see the same state.
// One config is active at a time; the Python pipeline reads the active one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname equivalent for ESM — resolve to web/server/utils → web/scripts/ingest
const __dirname = dirname(fileURLToPath(import.meta.url))
export const INGEST_DIR = join(__dirname, '..', '..', 'scripts', 'ingest')

export type AiConfig = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  presetId?: string
  updatedAt: string
}

export type AiConfigMasked = Omit<AiConfig, 'apiKey'> & {
  apiKey: string        // masked: "sk-••••abcd"
  hasKey: boolean
}

export type Preset = {
  id: string
  label: string
  provider: string
  baseUrl: string
  defaultModels: string[]
  hint: string
}

// ----- Presets -----------------------------------------------------------

export const PRESETS: Preset[] = [
  {
    id: 'deepseek-official',
    label: 'DeepSeek (官方)',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-flash', 'deepseek-v4-pro'],
    hint: 'OpenAI Format, 国内直连稳定',
  },
  {
    id: 'empiriolabs',
    label: 'EmpirioLabs AI',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://api.empiriolabs.ai/v1',
    defaultModels: ['deepseek-v4-1-flash-1017', 'deepseek-v4-flash-0731', 'deepseek-v4-pro', 'gpt-4o-mini'],
    hint: 'sk-empiriolabs-... key, 900+ models on one key',
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 / DashScope',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['deepseek-v4.1-flash-1017', 'qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct'],
    hint: 'compatible-mode OpenAI 端点',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'OpenAI Compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: [
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'inclusionai/ling-3.2-flash:free',
      'baidu/ernie-5.5-flash-preview:free',
      'particle-ai/particle-1:free',
      'nvidia/nemotron-3.5-lightning:free',
      'google/gemma-4-31b-it:free',
    ],
    hint: ':free 免费模型，有速率/每日额度限制',
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    provider: 'OpenAI Compatible',
    baseUrl: 'http://localhost:11434/v1',
    defaultModels: ['qwen2.5:7b', 'llama3.1:8b', 'deepseek-r1:14b'],
    hint: '本地运行，无 API Key',
  },
  {
    id: 'custom',
    label: '自定义',
    provider: 'OpenAI Compatible',
    baseUrl: '',
    defaultModels: [],
    hint: '自由填写任何 OpenAI 兼容端点',
  },
]

export function presetById(id: string | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

// ----- Disk I/O ----------------------------------------------------------

export const CONFIG_FILE = join(INGEST_DIR, 'ai_config.json')

// v2 layout: multiple saved configs + one active id. Legacy single-object files
// are migrated on read so existing checkouts keep working.
export type AiConfigFile = {
  version: 2
  activeId: string | null
  configs: AiConfig[]
}

export function readConfigFile(): AiConfigFile {
  const empty: AiConfigFile = { version: 2, activeId: null, configs: [] }
  try {
    if (!existsSync(CONFIG_FILE)) return empty
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    if (parsed && Array.isArray(parsed.configs)) {
      const configs = (parsed.configs as AiConfig[]).filter((c) => c && c.baseUrl)
      const activeId = configs.some((c) => c.id === parsed.activeId)
        ? (parsed.activeId as string)
        : (configs[0]?.id ?? null)
      return { version: 2, activeId, configs }
    }
    if (parsed && parsed.baseUrl) {
      const cfg = parsed as AiConfig
      return { version: 2, activeId: cfg.id, configs: [cfg] }
    }
    return empty
  } catch {
    return empty
  }
}

export function writeConfigFile(file: AiConfigFile): void {
  mkdirSync(INGEST_DIR, { recursive: true })
  const body = { version: 2, activeId: file.activeId, configs: file.configs }
  writeFileSync(CONFIG_FILE, JSON.stringify(body, null, 2), 'utf-8')
}

export function activeConfig(file = readConfigFile()): AiConfig | null {
  return file.configs.find((c) => c.id === file.activeId) ?? file.configs[0] ?? null
}

export function readConfig(): AiConfig | null {
  return activeConfig()
}

export function listMasked(file = readConfigFile()) {
  const active = activeConfig(file)
  return {
    activeId: active?.id ?? null,
    current: toMasked(active),
    configs: file.configs.map((c) => toMasked(c)!),
  }
}

// ----- Masking -----------------------------------------------------------

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••'
  const prefix = key.startsWith('sk-') ? 'sk-' : key.slice(0, 4)
  const suffix = key.slice(-4)
  return `${prefix}••••${suffix}`
}

export function toMasked(cfg: AiConfig | null): AiConfigMasked | null {
  if (!cfg) return null
  return {
    id: cfg.id,
    label: cfg.label,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    presetId: cfg.presetId,
    updatedAt: cfg.updatedAt,
    apiKey: maskKey(cfg.apiKey),
    hasKey: !!cfg.apiKey,
  }
}

// ----- Validation --------------------------------------------------------

const URL_RE = /^https?:\/\/[^\s]+$/

export function validateConfig(input: Partial<AiConfig>): string[] {
  const errs: string[] = []
  if (!input.label || !input.label.trim()) errs.push('label 不能为空')
  if (!input.baseUrl || !input.baseUrl.trim()) errs.push('baseUrl 不能为空')
  else if (!URL_RE.test(input.baseUrl)) errs.push('baseUrl 必须是 http(s)://... 格式')
  if (!input.model || !input.model.trim()) errs.push('model 不能为空')
  if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 2)) {
    errs.push('temperature 必须在 0–2 之间')
  }
  return errs
}
